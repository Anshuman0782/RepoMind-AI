import re

from app.models.schemas import SourceChunk
from app.services.codebase_tools import list_files, read_file
from app.services.context_utils import mentioned_file_paths
from app.services.llm_provider import LLMProviderError, generate_answer
from app.services.vector_store import search_chunks


MAX_DOC_CHUNKS = 10
MAX_FILE_CONTEXT_CHARS = 18_000


def is_documentation_request(message: str) -> bool:
    lowered = message.lower()
    documentation_terms = (
        "api docs",
        "architecture",
        "documentation",
        "docs",
        "explain file",
        "explain module",
        "onboarding",
        "readme",
        "setup notes",
    )
    return any(term in lowered for term in documentation_terms)


async def generate_documentation(project_id: str, message: str) -> tuple[str, list[SourceChunk]]:
    chunks = await _collect_documentation_context(project_id, message)
    sources = [SourceChunk(**chunk) for chunk in chunks]
    prompt = _documentation_prompt(message, chunks)

    try:
        answer = await generate_answer(prompt, chunks)
        if answer.strip().lower().startswith("mock mode is working"):
            answer = _fallback_documentation(message, chunks)
    except LLMProviderError:
        answer = _fallback_documentation(message, chunks)

    return _normalize_documentation(answer), sources


async def _collect_documentation_context(project_id: str, message: str) -> list[dict]:
    explicit_path = _explicit_file_path(message)
    if explicit_path:
        try:
            file_content = await read_file(project_id, explicit_path)
            return [
                {
                    "file_path": file_content["path"],
                    "start_line": 1,
                    "end_line": file_content["line_count"],
                    "content": file_content["content"][:MAX_FILE_CONTEXT_CHARS],
                }
            ]
        except (FileNotFoundError, ValueError):
            pass

    chunks = await search_chunks(project_id, message, limit=MAX_DOC_CHUNKS)
    important_names = ("README", "package.json", "pyproject.toml", "requirements.txt", "docker-compose.yml")
    try:
        files = await list_files(project_id)
    except ValueError:
        files = []

    for entry in files:
        if not any(entry["path"].endswith(name) for name in important_names):
            continue
        try:
            file_content = await read_file(project_id, entry["path"])
        except (FileNotFoundError, ValueError):
            continue
        chunks.append(
            {
                "file_path": file_content["path"],
                "start_line": 1,
                "end_line": file_content["line_count"],
                "content": file_content["content"][:MAX_FILE_CONTEXT_CHARS],
            }
        )

    return _dedupe_chunks(chunks)[:MAX_DOC_CHUNKS]


def _explicit_file_path(message: str) -> str | None:
    paths = mentioned_file_paths(message, limit=1)
    return paths[0] if paths else None


def _dedupe_chunks(chunks: list[dict]) -> list[dict]:
    deduped = []
    seen = set()
    for chunk in chunks:
        key = (chunk["file_path"], chunk["start_line"], chunk["end_line"])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(chunk)
    return deduped


def _documentation_prompt(message: str, chunks: list[dict]) -> str:
    evidence = "\n".join(
        f"- {chunk['file_path']}:{chunk['start_line']}-{chunk['end_line']}"
        for chunk in chunks
    )
    return (
        "You are RepoMind's Documentation Agent. Generate repository documentation from the provided evidence. "
        "Do not claim files were edited. If the user asks for README improvements, produce clear suggested README text or sections. "
        "If the user asks for setup notes, include commands only when the evidence supports them. "
        "If the user asks for API docs, summarize visible endpoints, request shapes, and responses. "
        "If the user asks to explain a file or module, explain its responsibility, important functions, data flow, and risks. "
        "Keep the answer practical, structured, and grounded in file references. "
        "If evidence is incomplete, say exactly what is unknown. "
        "Do not recommend frameworks, libraries, or rewrites unless the repository evidence or user request clearly supports them. "
        "Do not use underline-style headings, numbered decoration, tables, or a standalone language label like 'markdown'. "
        "Use bold section labels because the app renders those cleanly.\n\n"
        f"User documentation request: {message}\n\n"
        f"Evidence candidates:\n{evidence or '- No indexed evidence found'}\n\n"
        "Use this format:\n"
        "**Documentation Agent**\n"
        "**Overview**\n"
        "Short practical summary.\n\n"
        "**Key Responsibilities**\n"
        "- Concrete responsibility from repo evidence.\n\n"
        "**Important Code Paths**\n"
        "- `file:line`: why it matters.\n\n"
        "**Data Flow**\n"
        "- Step-by-step flow if relevant.\n\n"
        "**Risks Or Gaps**\n"
        "- Specific risk or unknown from evidence.\n\n"
        "**Suggested Next Steps**\n"
        "- Practical next action."
    )


def _fallback_documentation(message: str, chunks: list[dict]) -> str:
    files = []
    for chunk in chunks:
        if chunk["file_path"] not in files:
            files.append(chunk["file_path"])

    file_lines = "\n".join(f"- `{path}`" for path in files[:8]) or "- No readable repository files were found."
    return (
        "**Documentation Agent**\n"
        f"Request: {message}\n\n"
        "**Relevant Files**\n"
        f"{file_lines}\n\n"
        "**Draft Notes**\n"
        "- The available context was limited, so this is a starting point rather than final documentation.\n"
        "- Use the listed files as the source of truth for architecture, setup, API behavior, and onboarding notes.\n\n"
        "**Next Step**\n"
        "- Ask for a specific artifact such as `README improvement`, `architecture summary`, `API docs`, `setup notes`, or `onboarding guide` to generate a focused draft."
    )


def _normalize_documentation(answer: str) -> str:
    cleaned = re.sub(r"\n{3,}", "\n\n", answer.strip())
    cleaned = _normalize_heading_style(cleaned)
    cleaned = _remove_language_label_lines(cleaned)
    cleaned = _remove_duplicate_documentation_title(cleaned)
    cleaned = _normalize_bullets(cleaned)
    cleaned = _remove_unsupported_suggestions(cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned.strip())
    if not cleaned.startswith("**Documentation Agent**"):
        cleaned = re.sub(r"^\*\*Documentation Agent\*\*\s*", "", cleaned).strip()
        return f"**Documentation Agent**\n{cleaned}"
    return cleaned


def _remove_duplicate_documentation_title(answer: str) -> str:
    lines = answer.splitlines()
    cleaned_lines = []
    seen_title = False
    for line in lines:
        stripped = line.strip()
        if stripped in {"Documentation Agent", "**Documentation Agent**"}:
            if seen_title:
                continue
            cleaned_lines.append("**Documentation Agent**")
            seen_title = True
            continue
        cleaned_lines.append(line)
    return "\n".join(cleaned_lines)


def _normalize_heading_style(answer: str) -> str:
    lines = answer.splitlines()
    normalized = []
    index = 0
    while index < len(lines):
        line = lines[index].strip()
        next_line = lines[index + 1].strip() if index + 1 < len(lines) else ""
        if line and re.fullmatch(r"[-=]{3,}", next_line):
            normalized.append(_bold_heading(line))
            index += 2
            continue
        if line.startswith("#"):
            normalized.append(_bold_heading(line.lstrip("#").strip()))
        else:
            normalized.append(lines[index])
        index += 1
    return "\n".join(normalized)


def _bold_heading(text: str) -> str:
    cleaned = text.strip().strip(":")
    if cleaned.lower() == "documentation agent":
        return "**Documentation Agent**"
    if cleaned.startswith("**") and cleaned.endswith("**"):
        return cleaned
    return f"**{cleaned}**"


def _remove_language_label_lines(answer: str) -> str:
    return "\n".join(
        line for line in answer.splitlines() if line.strip().lower() not in {"markdown", "text"}
    )


def _normalize_bullets(answer: str) -> str:
    lines = []
    for line in answer.splitlines():
        lines.append(re.sub(r"^(\s*)\*\s+", r"\1- ", line))
    return "\n".join(lines)


def _remove_unsupported_suggestions(answer: str) -> str:
    blocked_patterns = (
        "consider using a javascript framework",
        "consider using a framework",
        "use a javascript framework",
        "use a framework",
    )
    kept_lines = []
    for line in answer.splitlines():
        lowered = line.lower()
        if any(pattern in lowered for pattern in blocked_patterns):
            continue
        kept_lines.append(line)
    return "\n".join(kept_lines)
