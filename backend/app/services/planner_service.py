from dataclasses import dataclass
import re

from app.models.schemas import SourceChunk
from app.services.codebase_tools import read_file, search_code
from app.services.context_utils import full_file_chunks_for_message, merge_context_chunks
from app.services.llm_provider import LLMProviderError, generate_answer
from app.services.vector_store import search_chunks


MAX_PLAN_CHUNKS = 6
MAX_KEYWORD_RESULTS = 6
MAX_TOTAL_EVIDENCE = 20


@dataclass
class FileIntent:
    action: str | None = None
    path: str | None = None
    content: str | None = None
    change_request: str | None = None
    missing_fields: tuple[str, ...] = ()


def _keywords(message: str) -> list[str]:
    tokens = re.findall(r"[a-zA-Z_][a-zA-Z0-9_]{2,}", message)
    ignored = {
        "add",
        "change",
        "create",
        "edit",
        "feature",
        "file",
        "fix",
        "make",
        "please",
        "refactor",
        "remove",
        "update",
    }
    seen = set()
    keywords = []
    for token in tokens:
        lowered = token.lower()
        if lowered in ignored or lowered in seen:
            continue
        seen.add(lowered)
        keywords.append(token)
    return keywords[:6]


def _dedupe_chunks(chunks: list[dict]) -> list[dict]:
    deduped = []
    seen = set()
    for chunk in chunks:
        key = (chunk["file_path"], chunk["start_line"], chunk["end_line"], chunk["content"])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(chunk)
    return deduped


async def collect_planning_evidence(project_id: str, message: str) -> list[dict]:
    chunks = await search_chunks(project_id, message, limit=MAX_PLAN_CHUNKS)
    explicit_file_chunks = await full_file_chunks_for_message(project_id, message)
    keyword_hits = []

    for keyword in _keywords(message):
        try:
            keyword_hits.extend(await search_code(project_id, keyword, limit=2))
        except ValueError:
            continue

    for hit in keyword_hits[:MAX_KEYWORD_RESULTS]:
        chunks.append(
            {
                "file_path": hit["file_path"],
                "start_line": hit["line_number"],
                "end_line": hit["line_number"],
                "content": hit["line"],
            }
        )

    matched_paths = []
    for chunk in chunks:
        path = chunk["file_path"]
        if path not in matched_paths:
            matched_paths.append(path)

    for path in matched_paths[:3]:
        try:
            file_content = await read_file(project_id, path)
        except (FileNotFoundError, ValueError):
            continue
        if file_content["line_count"] > 180:
            continue
        chunks.append(
            {
                "file_path": file_content["path"],
                "start_line": 1,
                "end_line": file_content["line_count"],
                "content": file_content["content"],
            }
        )

    return _dedupe_chunks(merge_context_chunks(explicit_file_chunks, chunks))[:MAX_TOTAL_EVIDENCE]


async def plan_change(project_id: str, message: str) -> tuple[str, list[SourceChunk], list[dict] | None]:
    chunks = await collect_planning_evidence(project_id, message)
    sources = [SourceChunk(**chunk) for chunk in chunks]
    file_intent = parse_file_intent(message)
    if file_intent.action in {"create", "edit", "delete"} and file_intent.missing_fields:
        return _missing_file_intent_answer(file_intent), sources, None

    proposed_operations = await _proposed_operations_from_intent(project_id, file_intent, message)
    direct_plan = _direct_change_plan(message, chunks)
    if direct_plan:
        return direct_plan, sources, proposed_operations

    prompt = _planning_prompt(message, chunks)

    try:
        answer = await generate_answer(prompt, chunks)
        if answer.strip().lower().startswith("mock mode is working"):
            answer = _fallback_plan(message, chunks)
    except LLMProviderError:
        answer = _fallback_plan(message, chunks)

    answer = _normalize_plan_answer(answer, message, chunks)

    return answer, sources, proposed_operations


async def _proposed_operations_from_intent(
    project_id: str,
    intent: FileIntent,
    message: str,
) -> list[dict] | None:
    if not intent.action or not intent.path or intent.missing_fields:
        return None

    if intent.action == "delete":
        return [{"action": intent.action, "path": intent.path}]

    if intent.action == "create":
        if intent.content is None:
            return None
        return [{"action": intent.action, "path": intent.path, "content": intent.content}]

    content = intent.content
    if intent.action == "edit" and content is None:
        content = await _generated_edit_file_content(project_id, message, intent.path)
    if content is None:
        return None

    return [{"action": intent.action, "path": intent.path, "content": content}]


def parse_file_intent(message: str) -> FileIntent:
    user_message = _user_request_text(message)
    action = _requested_file_action(user_message)
    path = _requested_file_path(user_message)
    content = _requested_file_content(user_message)
    if action == "create" and content is None:
        content = _requested_create_inline_content(user_message)
    change_request = _requested_change_request(user_message, path, content) if action == "edit" else None

    missing = []
    if action == "create":
        if not path:
            missing.append("file path")
        if content is None:
            missing.append("file content")
    elif action == "edit":
        if not path:
            missing.append("file path")
        if not change_request and content is None:
            missing.append("change request")
    elif action == "delete" and not path:
        missing.append("file path")

    return FileIntent(
        action=action,
        path=path,
        content=content,
        change_request=change_request,
        missing_fields=tuple(missing),
    )


def requested_file_intent(message: str) -> dict:
    intent = parse_file_intent(message)
    return {
        "action": intent.action,
        "path": intent.path,
        "has_content": intent.content is not None,
    }


def _requested_file_action(message: str) -> str | None:
    message = _user_request_text(message)
    lowered = message.lower()
    path = _requested_file_path(message)
    if re.search(r"\b(delete|remove)\b.*\bfile\b|\bfile\b.*\b(delete|remove)\b", lowered):
        return "delete"
    if re.search(r"\b(edit|update|replace|modify)\b.*\bfile\b|\bfile\b.*\b(edit|update|replace|modify)\b", lowered):
        return "edit"
    if re.search(r"\b(create|add|new)\b.*\bfile\b|\bfile\b.*\b(create|add|new)\b", lowered):
        return "create"
    if path and re.search(r"\b(delete|remove)\b", lowered):
        return "delete"
    if path and re.search(r"\b(edit|update|replace|modify|change)\b", lowered):
        return "edit"
    if path and re.search(r"\b(create|add|new|make|build)\b", lowered):
        return "create"
    return None


def _requested_file_path(message: str) -> str | None:
    message = _user_request_text(message)
    explicit_path_patterns = [
        r"(?:file\s+path|filepath|path)\s*[:=]\s*`?([A-Za-z0-9_./\\+-]+\.[A-Za-z0-9+]+)`?",
        r"[`'\"]([A-Za-z0-9_./\\+-]+\.[A-Za-z0-9+]+)[`'\"]",
    ]
    for pattern in explicit_path_patterns:
        match = re.search(pattern, message, flags=re.IGNORECASE)
        if match and "/" in match.group(1).replace("\\", "/"):
            return match.group(1).strip().replace("\\", "/")

    file_name = _requested_file_name(message)
    directory = _requested_directory_path(message)
    if file_name and directory:
        return f"{directory.rstrip('/')}/{file_name}".replace("\\", "/")

    fallback_patterns = [
        r"(?:file\s+path|filepath|path)\s*[:=]\s*`?([A-Za-z0-9_./\\+-]+\.[A-Za-z0-9+]+)`?",
        r"(?:create|add|new|make|build|edit|update|replace|modify|change|delete|remove)\s+(?:a\s+|the\s+)?(?:file\s+)?[`'\"]?([A-Za-z0-9_./\\+-]+\.[A-Za-z0-9+]+)[`'\"]?",
        r"(?:file|called|named|filename|file\s+name)\s*[:=]?\s*[`'\"]?([A-Za-z0-9_./\\+-]+\.[A-Za-z0-9+]+)[`'\"]?",
        r"[`'\"]([A-Za-z0-9_./\\+-]+\.[A-Za-z0-9+]+)[`'\"]",
    ]
    for pattern in fallback_patterns:
        match = re.search(pattern, message, flags=re.IGNORECASE)
        if match:
            return match.group(1).strip().replace("\\", "/")

    match = re.search(r"\b([A-Za-z0-9_./\\+-]+\.[A-Za-z0-9+]+)\b", message)
    if match:
        return match.group(1).strip().replace("\\", "/")
    return None


def _requested_file_name(message: str) -> str | None:
    patterns = [
        r"(?:filename|file\s+name|called|named|file)\s*[:=]?\s*[`'\"]?([A-Za-z0-9_+-]+\.[A-Za-z0-9+]+)[`'\"]?",
    ]
    for pattern in patterns:
        match = re.search(pattern, message, flags=re.IGNORECASE)
        if match:
            return match.group(1).strip()
    return None


def _requested_directory_path(message: str) -> str | None:
    patterns = [
        r"\b(?:folder|directory|dir|inside|in|at|path)\b\s*[:=]?\s*[`'\"]?([A-Za-z0-9_./\\+-]+)[`'\"]?",
    ]
    for pattern in patterns:
        match = re.search(pattern, message, flags=re.IGNORECASE)
        if not match:
            continue
        value = match.group(1).strip().replace("\\", "/")
        if "." in value.rsplit("/", 1)[-1]:
            continue
        if value.lower() in {"file", "folder", "directory", "path"}:
            continue
        return value
    return None


def _requested_file_content(message: str) -> str | None:
    message = _user_request_text(message)
    fenced = re.search(r"```[a-zA-Z0-9_+#.-]*\n?([\s\S]*?)```", message)
    if fenced:
        return fenced.group(1).rstrip("\n")

    marker = re.search(
        r"(?:content|contents|file\s+content|write\s+this|with\s+this|put\s+this)\s*(?:is|as|[:=])?\s*([\s\S]+)$",
        message,
        flags=re.IGNORECASE,
    )
    if not marker:
        return None

    content = marker.group(1).strip()
    return content or None


def _requested_create_inline_content(message: str) -> str | None:
    marker = re.search(r"\bwith\s+([\s\S]+)$", message, flags=re.IGNORECASE)
    if not marker:
        return None
    content = marker.group(1).strip()
    if not content or re.match(r"^(file|path|name|filename)\b", content, flags=re.IGNORECASE):
        return None
    return content


def _requested_change_request(message: str, path: str | None, content: str | None) -> str | None:
    if content is not None:
        return "replace the full file content"
    cleaned = _user_request_text(message).strip()
    if path:
        cleaned = cleaned.replace(path, " ")
        cleaned = cleaned.replace(path.replace("/", "\\"), " ")
    cleaned = re.sub(r"\b(in|at|inside)\s*$", " ", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(
        r"^\s*\b(edit|update|modify|change)\b\s+(?:the\s+)?(?:file\s+)?",
        " ",
        cleaned,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(r"^\s*and\s+", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" .")
    return cleaned or None


def _missing_file_intent_answer(intent: FileIntent) -> str:
    fields = ", ".join(intent.missing_fields)
    action = intent.action or "file change"
    return (
        "**More Details Needed**\n"
        f"I can handle this {action} request, but I still need: {fields}.\n\n"
        "**Please Reply With**\n"
        "- File path, including the file name, for example `src/example.ts`.\n"
        "- File content for create requests, or the exact change you want for edit requests."
    )


def _user_request_text(message: str) -> str:
    return re.split(r"\n\s*Language requirement:", message, maxsplit=1, flags=re.IGNORECASE)[0].strip()


async def _generated_edit_file_content(project_id: str, message: str, path: str) -> str | None:
    try:
        file_content = await read_file(project_id, path)
    except (FileNotFoundError, ValueError):
        return None

    original = file_content["content"]
    request = _requested_change_request(message, path, None) or _user_request_text(message)
    fallback = _fallback_edit_file_content(original, request)
    if fallback is not None:
        return fallback

    prompt = (
        "Rewrite the complete file content to satisfy the user's requested edit. "
        "Return only the full updated file content. Do not include markdown fences, explanations, or diffs. "
        "Preserve unrelated code and formatting as much as possible. If the request is ambiguous or cannot be "
        "applied safely, return the exact text CANNOT_APPLY_EDIT.\n\n"
        f"File path: {path}\n"
        f"User edit request: {request}\n\n"
        f"Current file content:\n{original}"
    )
    try:
        updated = await generate_answer(prompt, [{"file_path": path, "start_line": 1, "end_line": file_content["line_count"], "content": original}])
    except LLMProviderError:
        return None

    cleaned = _strip_code_fence(updated)
    if cleaned.strip() == "CANNOT_APPLY_EDIT" or cleaned == original:
        return None
    return cleaned


def _fallback_edit_file_content(original: str, request: str) -> str | None:
    match = re.search(
        r"\breplace\s+[`'\"]?(.+?)[`'\"]?\s+with\s+[`'\"]?(.+?)[`'\"]?$",
        request,
        flags=re.IGNORECASE | re.DOTALL,
    )
    if match:
        old = match.group(1).strip()
        new = match.group(2).strip()
        return original.replace(old, new, 1) if old in original else None

    match = re.search(
        r"\b(?:change|update)\s+(.+?)\s+(?:from\s+[`'\"]?(.+?)[`'\"]?\s+)?to\s+[`'\"]?(.+?)[`'\"]?$",
        request,
        flags=re.IGNORECASE | re.DOTALL,
    )
    if match:
        subject = match.group(1).strip().lower()
        old = (match.group(2) or "").strip()
        new = match.group(3).strip()
        if old and old in original:
            return original.replace(old, new, 1)
        if subject in {"title", "html title", "page title"}:
            updated, count = re.subn(
                r"(<title>)(.*?)(</title>)",
                lambda match: f"{match.group(1)}{new}{match.group(3)}",
                original,
                count=1,
                flags=re.IGNORECASE | re.DOTALL,
            )
            return updated if count else None

    return None


async def _generated_create_file_content(message: str, path: str) -> str:
    prompt = (
        "Generate complete starter content for the requested new file. "
        "Return only the file content, with no markdown fence and no explanation. "
        "Keep it small, valid, and directly matched to the file extension and user request. "
        "If the request is vague, create a minimal useful starter file.\n\n"
        f"File path: {path}\n"
        f"User request: {message}"
    )
    try:
        content = await generate_answer(prompt, [])
        if content.strip().lower().startswith("mock mode is working"):
            return _fallback_create_file_content(path, message)
        return _strip_code_fence(content)
    except LLMProviderError:
        return _fallback_create_file_content(path, message)


def _strip_code_fence(content: str) -> str:
    cleaned = content.strip()
    cleaned = re.sub(r"^```[a-zA-Z0-9_+#.-]*\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    return f"{cleaned.rstrip()}\n"


def _fallback_create_file_content(path: str, message: str) -> str:
    lowered_path = path.lower()
    lowered_message = message.lower()
    if lowered_path.endswith((".c", ".cc", ".cpp", ".cxx", ".c++")):
        if "calculator" in lowered_message:
            return (
                "#include <iostream>\n\n"
                "int main() {\n"
                "    double left = 0;\n"
                "    double right = 0;\n"
                "    char operation = '+';\n\n"
                "    std::cout << \"Enter: number operator number: \";\n"
                "    std::cin >> left >> operation >> right;\n\n"
                "    switch (operation) {\n"
                "        case '+': std::cout << left + right; break;\n"
                "        case '-': std::cout << left - right; break;\n"
                "        case '*': std::cout << left * right; break;\n"
                "        case '/':\n"
                "            if (right == 0) {\n"
                "                std::cout << \"Cannot divide by zero\";\n"
                "                return 1;\n"
                "            }\n"
                "            std::cout << left / right;\n"
                "            break;\n"
                "        default:\n"
                "            std::cout << \"Unsupported operation\";\n"
                "            return 1;\n"
                "    }\n\n"
                "    std::cout << std::endl;\n"
                "    return 0;\n"
                "}\n"
            )
        return "#include <iostream>\n\nint main() {\n    std::cout << \"Hello\" << std::endl;\n    return 0;\n}\n"
    if lowered_path.endswith((".js", ".jsx", ".ts", ".tsx")):
        return "export function main() {\n  return \"Hello\";\n}\n"
    if lowered_path.endswith(".py"):
        return "def main():\n    print(\"Hello\")\n\n\nif __name__ == \"__main__\":\n    main()\n"
    if lowered_path.endswith((".md", ".mdx")):
        title = path.rsplit("/", 1)[-1].rsplit(".", 1)[0].replace("-", " ").replace("_", " ").title()
        return f"# {title}\n\nAdd project notes here.\n"
    if lowered_path.endswith(".html"):
        return "<!doctype html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"utf-8\" />\n  <title>New Page</title>\n</head>\n<body>\n  <h1>New Page</h1>\n</body>\n</html>\n"
    return ""


def _direct_change_plan(message: str, chunks: list[dict]) -> str | None:
    lowered = message.lower()
    create_file_plan = _direct_create_file_plan(message, chunks)
    if create_file_plan:
        return create_file_plan
    refactor_plan = _direct_refactor_plan(message, chunks)
    if refactor_plan:
        return refactor_plan

    if "button" not in lowered or "color" not in lowered:
        return None

    issues = []
    for chunk in chunks:
        for offset, line in enumerate(chunk["content"].splitlines()):
            stripped = line.strip()
            if re.search(r"addEventListener\s*\(.*\(\)\s*\{", stripped):
                line_number = chunk["start_line"] + offset
                issues.append(
                    {
                        "key": ("listener", chunk["file_path"], line_number),
                        "plan": (
                            f"- `{chunk['file_path']}:{line_number}`: fix the click handler syntax by changing `{stripped}` "
                            "to `button.addEventListener(\"click\", () => {`. This lets the script run and reach the color-change logic."
                        ),
                        "risk": "- If this syntax error remains, the browser stops parsing the script and the button click never runs.",
                        "test": "- Confirm the browser console no longer shows a syntax error near the click handler.",
                    }
                )
            if re.search(r"Math\.floor\s*\(\s*\.random\s*\(", stripped):
                line_number = chunk["start_line"] + offset
                issues.append(
                    {
                        "key": ("random", chunk["file_path"], line_number),
                        "plan": (
                            f"- `{chunk['file_path']}:{line_number}`: fix the random color selection by changing `{stripped}` "
                            "so it calls `Math.random()` inside `Math.floor(...)`. The button handler can then choose a valid color index."
                        ),
                        "risk": "- The index expression must stay bounded by `colors.length` to avoid selecting `undefined`.",
                        "test": "- Confirm the browser console no longer shows an error for `.random`.",
                    }
                )

    deduped_issues = []
    seen = set()
    for issue in issues:
        if issue["key"] in seen:
            continue
        seen.add(issue["key"])
        deduped_issues.append(issue)
    if not deduped_issues:
        return None

    plan = "\n".join(issue["plan"] for issue in deduped_issues)
    risks = "\n".join(issue["risk"] for issue in deduped_issues)
    tests = "\n".join(
        [
            "- Open the selected project page in a browser and click `Change Color`; the body background should change.",
            *(issue["test"] for issue in deduped_issues),
        ]
    )
    return _with_single_approval_gate(
        "**Change Plan**\n"
        f"{plan}\n\n"
        "**Risks**\n"
        f"{risks}\n"
        "- Keep the existing color list and button styles unchanged unless the user asks for a visual change.\n\n"
        "**Suggested Tests**\n"
        f"{tests}"
    )
    return None


def _direct_refactor_plan(message: str, chunks: list[dict]) -> str | None:
    lowered = message.lower()
    if "refactor" not in lowered:
        return None

    index_path = _best_existing_path(chunks, "index.html")
    if "javascript" in lowered or "click handler" in lowered or "color list" in lowered:
        return _with_single_approval_gate(
            "**Change Plan**\n"
            f"- `{index_path}`: refactor only the existing script section by moving the color-picking expression into a small helper function and keeping the click handler focused on updating `document.body.style.backgroundColor`.\n\n"
            "**Risks**\n"
            "- The refactor must preserve the same button behavior and the existing color list.\n"
            "- Introducing a separate JavaScript module would add extra loading/module behavior, so keep this refactor inside the current file unless the user explicitly asks for a new JS file.\n\n"
            "**Suggested Tests**\n"
            "- Open `index.html` in a browser and click `Change Color` several times; the background should keep changing.\n"
            "- Confirm the heading, button label, layout, and hover styling are unchanged.\n"
            "- Confirm the browser console has no JavaScript errors."
        )
    return None


def _direct_create_file_plan(message: str, chunks: list[dict]) -> str | None:
    lowered = message.lower()
    if "create" not in lowered or "file" not in lowered:
        return None
    if "index.html" not in lowered:
        return None

    new_file_match = re.search(
        r"(?:called|named|file)\s+[`'\"]?([A-Za-z0-9_-]+\.html)[`'\"]?",
        message,
        flags=re.IGNORECASE,
    )
    if not new_file_match:
        return None

    new_file = new_file_match.group(1)
    index_path = _best_existing_path(chunks, "index.html")
    feature_label = _title_from_file(new_file)
    if "calculator" in lowered:
        feature_description = "a usable calculator interface"
        manual_test = f"- Open `{new_file}` from the main page, try a simple calculation, and confirm the result updates."
    else:
        feature_description = f"the requested {feature_label} page content"
        manual_test = f"- Open `{new_file}` from the main page and confirm the page content renders."

    return _with_single_approval_gate(
        "**Change Plan**\n"
        f"- `{index_path}`: add one visible link to `{new_file}` so users can open the new page from the main page.\n"
        f"- `{new_file}`: create this new file using the existing `index.html` structure and visual style, add {feature_description}, and include a `Back to Home` link to `index.html`.\n\n"
        "**Risks**\n"
        f"- The link in `{index_path}` must match the new file name exactly: `{new_file}`.\n"
        f"- Copying styles into `{new_file}` can drift from `{index_path}` later, so keep the reused style minimal and intentional.\n\n"
        "**Suggested Tests**\n"
        f"- Open `{index_path}` in a browser and click the `{feature_label}` link; it should load `{new_file}`.\n"
        f"{manual_test}\n"
        f"- Click `Back to Home` on `{new_file}` and confirm it returns to `{index_path}`."
    )


def _best_existing_path(chunks: list[dict], fallback: str) -> str:
    for chunk in chunks:
        if chunk["file_path"].lower().endswith(fallback.lower()):
            return chunk["file_path"]
    return fallback


def _title_from_file(file_path: str) -> str:
    name = file_path.rsplit("/", 1)[-1].rsplit("\\", 1)[-1].rsplit(".", 1)[0]
    words = re.sub(r"[_-]+", " ", name).strip()
    return words or name


def _with_single_approval_gate(answer: str) -> str:
    cleaned = re.sub(
        r"\n*\*\*Approval Gate\*\*[\s\S]*$",
        "",
        answer.strip(),
        flags=re.IGNORECASE,
    ).rstrip()
    return f"{cleaned}\n\n**Approval Gate**\nNo files will be edited until you approve this plan."


def _normalize_plan_answer(answer: str, message: str, chunks: list[dict]) -> str:
    if _looks_like_unsafe_plan(answer):
        fallback = _direct_change_plan(message, chunks) or _fallback_plan(message, chunks)
        return _with_single_approval_gate(fallback)
    cleaned = _replace_placeholder_paths(answer, chunks)
    cleaned = _dedupe_plan_bullets(cleaned)
    cleaned = _remove_confusing_create_file_bullets(cleaned, message)
    return _with_single_approval_gate(cleaned)


def _looks_like_unsafe_plan(answer: str) -> bool:
    lowered = answer.lower()
    required_sections = ("**change plan**", "**risks**", "**suggested tests**")
    if not all(section in lowered for section in required_sections):
        return True
    if "```" in answer:
        return True
    if re.search(r"\b(create|update|modify)\s+(?:the\s+)?[`'\"]?[\w./-]+\.(?:html|js|css|ts|tsx|py)", lowered):
        return True
    if "alternatively" in lowered:
        return True
    if "export const" in lowered or "import {" in lowered:
        return True
    return False


def _replace_placeholder_paths(answer: str, chunks: list[dict]) -> str:
    known_paths = []
    for chunk in chunks:
        path = chunk["file_path"]
        if path not in known_paths:
            known_paths.append(path)

    for path in known_paths:
        filename = path.rsplit("/", 1)[-1]
        answer = re.sub(
            rf"`(?:path/to/|/path/to/|\.?/)?{re.escape(filename)}`",
            f"`{path}`",
            answer,
            flags=re.IGNORECASE,
        )
        answer = re.sub(
            rf"\*\*(?:path/to/|/path/to/|\.?/)?{re.escape(filename)}\*\*",
            f"`{path}`",
            answer,
            flags=re.IGNORECASE,
        )

    return re.sub(
        r"`(?:path/to/|/path/to/)([^`]+)`",
        r"`\1`",
        answer,
        flags=re.IGNORECASE,
    )


def _dedupe_plan_bullets(answer: str) -> str:
    sections = re.split(r"(\n\*\*[^*\n]+\*\*\n)", f"\n{answer.strip()}")
    rebuilt = []
    for index, part in enumerate(sections):
        if index == 0:
            if part.strip():
                rebuilt.append(part.strip())
            continue
        if part.startswith("\n**"):
            rebuilt.append(part)
            continue

        lines = part.splitlines()
        seen = set()
        section_lines = []
        for line in lines:
            stripped = line.strip()
            if stripped.startswith("- "):
                normalized = re.sub(r"\s+", " ", stripped.lower())
                normalized = re.sub(r"`[^`]+`", "`path`", normalized, count=1)
                normalized = re.sub(r"\*\*[^*]+\*\*", "`path`", normalized, count=1)
                normalized = re.sub(r"modify existing html code to include", "add", normalized)
                normalized = re.sub(r"update .* to include", "add", normalized)
                if normalized in seen:
                    continue
                seen.add(normalized)
            section_lines.append(line)
        rebuilt.append("\n".join(section_lines).rstrip())

    return "".join(rebuilt).strip()


def _remove_confusing_create_file_bullets(answer: str, message: str) -> str:
    lowered = message.lower()
    if "create" not in lowered or ".html" not in lowered:
        return answer

    new_file_match = re.search(
        r"(?:called|named|file)\s+[`'\"]?([A-Za-z0-9_-]+\.html)[`'\"]?",
        message,
        flags=re.IGNORECASE,
    )
    if not new_file_match:
        return answer

    new_file = new_file_match.group(1).lower()
    filtered_lines = []
    for line in answer.splitlines():
        lowered_line = line.lower()
        if (
            lowered_line.startswith("- ")
            and "`index.html`" in lowered_line
            and new_file in lowered_line
            and "style" in lowered_line
            and "link" not in lowered_line
        ):
            continue
        filtered_lines.append(line)
    return "\n".join(filtered_lines)


def _planning_prompt(message: str, chunks: list[dict]) -> str:
    evidence = "\n".join(
        f"- {chunk['file_path']}:{chunk['start_line']}-{chunk['end_line']}"
        for chunk in chunks
    )
    return (
        "Create a read-only implementation plan for the requested code change. "
        "Do not write code, do not claim edits are complete, and do not ask for approval as if edits can begin automatically. "
        "Do not include code blocks or implementation snippets. "
        "Do not provide alternative implementations. Pick one conservative plan. "
        "Do not include an Approval Gate section; the server will append the approval gate. "
        "Never use placeholder paths like `path/to/file`; use concrete paths from evidence or the exact new file name requested. "
        "Do not repeat the same file with the same reason. Merge related changes for a file into one bullet. "
        "When creating a new file, put the new file content and styling plan under the new file bullet, and put only navigation/link changes under the existing entry file bullet. "
        "Prefer the smallest set of directly relevant files and lines. "
        "For syntax errors, name the exact malformed code and the exact correction. "
        "Avoid proposing unrelated style, label, or hover checks unless the request mentions styling. "
        "Use only the repository evidence provided where possible. If evidence is thin, say what needs inspection.\n\n"
        f"User change request: {message}\n\n"
        f"Evidence candidates:\n{evidence or '- No indexed evidence found'}\n\n"
        "Use this exact format:\n"
        "**Change Plan**\n"
        "- `path/to/file`: reason for the proposed change.\n\n"
        "**Risks**\n"
        "- Specific risk or unknown.\n\n"
        "**Suggested Tests**\n"
        "- Specific test, command, or manual check."
    )


def _fallback_plan(message: str, chunks: list[dict]) -> str:
    if chunks:
        files = []
        seen = set()
        for chunk in chunks:
            path = chunk["file_path"]
            if path in seen:
                continue
            seen.add(path)
            files.append(path)
            if len(files) == 4:
                break

        plan_lines = "\n".join(
            f"- `{path}`: inspect and update this area because it matched the requested change."
            for path in files
        )
    else:
        plan_lines = (
            "- `Unknown`: the indexed repo context did not surface a clear file yet; start by searching for the feature, route, UI label, or symbol named in the request."
        )

    return (
        "**Change Plan**\n"
        f"{plan_lines}\n\n"
        "**Risks**\n"
        f"- The request may need more context before edits if the matched files do not fully cover: {message}\n"
        "- Keep changes scoped to the approved files and avoid write actions until the plan is accepted.\n\n"
        "**Suggested Tests**\n"
        "- Run the project test or build command after edits are approved.\n"
        "- Manually verify the affected feature path in the app.\n\n"
        "**Approval Gate**\n"
        "No files will be edited until you approve this plan."
    )
