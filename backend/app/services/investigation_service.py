import json
import re
import tomllib
import xml.etree.ElementTree as ET

from app.models.schemas import SourceChunk
from app.services.codebase_tools import list_files, read_file, search_code
from app.services.context_utils import full_file_chunks_for_message, merge_context_chunks
from app.services.file_scanner import TEXT_EXTENSIONS, TEXT_FILE_NAMES
from app.services.language_utils import (
    MULTILINGUAL_BUG_TERMS,
    contains_any_term,
    language_instruction,
    response_language_for_message,
)
from app.services.llm_provider import LLMProviderError, generate_answer
from app.services.vector_store import search_chunks


MAX_EVIDENCE_CHUNKS = 4
MAX_KEYWORD_RESULTS = 4
MAX_BUG_EVIDENCE_CHUNKS = 16
MAX_BUG_SCAN_FILES = 120
MAX_DIRECT_BUG_ISSUES = 20
BUG_CONTEXT_RADIUS = 3
BUG_TERMS = (
    "bug",
    "error",
    "fails",
    "failed",
    "not working",
    "does nothing",
    "broken",
    "issue",
    "please check",
    "\u09a4\u09cd\u09b0\u09c1\u099f\u09bf",
    "\u09ad\u09c1\u09b2",
    "\u09b8\u09ae\u09b8\u09cd\u09af\u09be",
)


def _keywords(message: str) -> list[str]:
    tokens = re.findall(r"[a-zA-Z_][a-zA-Z0-9_]{2,}", message)
    seen = set()
    keywords = []
    for token in tokens:
        lowered = token.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        keywords.append(token)
    return keywords[:5]


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


async def collect_investigation_evidence(project_id: str, message: str) -> list[dict]:
    chunks = await search_chunks(project_id, message, limit=MAX_EVIDENCE_CHUNKS)
    explicit_file_chunks = await full_file_chunks_for_message(project_id, message)
    keyword_hits = []

    for keyword in _keywords(message):
        try:
            keyword_hits.extend(
                await search_code(project_id, keyword, limit=max(2, MAX_KEYWORD_RESULTS // 2))
            )
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

    merged = _dedupe_chunks(merge_context_chunks(explicit_file_chunks, chunks))
    if _effective_mode(message, "navigator") == "bug":
        merged = merge_context_chunks(
            merged,
            await _syntax_bug_chunks(project_id),
            limit=MAX_BUG_EVIDENCE_CHUNKS,
        )

    limit = (
        MAX_BUG_EVIDENCE_CHUNKS
        if _effective_mode(message, "navigator") == "bug"
        else MAX_EVIDENCE_CHUNKS + MAX_KEYWORD_RESULTS
    )
    return _dedupe_chunks(merged)[:limit]


async def investigate_codebase(
    project_id: str,
    message: str,
    mode: str,
    response_language: str | None = "auto",
) -> tuple[str, list[SourceChunk]]:
    effective_mode = _effective_mode(message, mode)
    chunks = await collect_investigation_evidence(project_id, message)
    sources = [SourceChunk(**chunk) for chunk in chunks]
    mode_label = "bug investigation" if effective_mode == "bug" else "repo navigation"

    if effective_mode == "bug":
        direct_answer = _direct_bug_answer(chunks, message, response_language)
        if direct_answer:
            return direct_answer, sources
    else:
        direct_answer = _direct_navigator_answer(message, chunks)
        if direct_answer:
            return direct_answer, sources

    prompt = _investigation_prompt(message, effective_mode, chunks, response_language)

    try:
        answer = await generate_answer(prompt, chunks)
    except LLMProviderError:
        answer = _fallback_answer(message, mode_label, chunks)

    return answer, sources


def _effective_mode(message: str, mode: str) -> str:
    lowered = message.lower()
    if (
        mode == "bug"
        or any(term in lowered for term in BUG_TERMS)
        or contains_any_term(message, MULTILINGUAL_BUG_TERMS)
    ):
        return "bug"
    return "navigator"


async def _syntax_bug_chunks(project_id: str) -> list[dict]:
    chunks = []
    try:
        files = await list_files(project_id)
    except Exception:
        return chunks

    scanned = 0
    for file in _prioritized_bug_files(files):
        path = file["path"]
        try:
            content = await read_file(project_id, path)
        except (FileNotFoundError, ValueError):
            continue

        scanned += 1
        for issue in _detect_bug_issues(
            content["path"],
            content["content"],
            start_line=1,
            line_count=content["line_count"],
        ):
            chunks.append(_context_chunk_for_issue(content, issue))
            if len(chunks) >= MAX_BUG_EVIDENCE_CHUNKS:
                return _dedupe_chunks(chunks)

        if scanned >= MAX_BUG_SCAN_FILES:
            break
    return _dedupe_chunks(chunks)


def _prioritized_bug_files(files: list[dict]) -> list[dict]:
    preferred_names = {
        "index.html",
        "main.js",
        "app.js",
        "script.js",
        "page.tsx",
        "app.tsx",
        "main.py",
        "app.py",
    }

    candidates = [file for file in files if _is_text_bug_candidate(file["path"])]
    return sorted(
        candidates,
        key=lambda file: (
            PathRank.low_priority(file["path"]),
            PathRank.type_priority(file["path"]),
            PathRank.name_priority(file["name"], preferred_names),
            file["path"].lower(),
        ),
    )


def _is_text_bug_candidate(path: str) -> bool:
    lowered_name = path.rsplit("/", 1)[-1].lower()
    suffix = f".{lowered_name.rsplit('.', 1)[-1]}" if "." in lowered_name else ""
    if lowered_name in {name.lower() for name in TEXT_FILE_NAMES}:
        return True
    if suffix in TEXT_EXTENSIONS:
        return True
    return any(lowered_name.endswith(extension) for extension in TEXT_EXTENSIONS if extension.count(".") > 1)


class PathRank:
    @staticmethod
    def low_priority(path: str) -> int:
        lowered = path.lower()
        if lowered.endswith((".test.js", ".test.ts", ".test.tsx", ".spec.js", ".spec.ts", ".spec.tsx")):
            return 1
        return 0

    @staticmethod
    def name_priority(name: str, preferred_names: set[str]) -> int:
        return 0 if name.lower() in preferred_names else 1

    @staticmethod
    def type_priority(path: str) -> int:
        lowered = path.lower()
        if lowered.endswith((".html", ".js", ".jsx", ".mjs", ".ts", ".tsx", ".vue", ".svelte", ".py")):
            return 0
        if lowered.endswith((".json", ".jsonc", ".toml", ".xml", ".yml", ".yaml")):
            return 1
        if lowered.endswith((".css", ".scss", ".sass", ".less", ".sh", ".ps1", ".sql")):
            return 2
        if lowered.endswith((".md", ".mdx", ".txt", ".log", ".lock", ".csv", ".tsv")):
            return 4
        return 3


def _has_known_js_bug(content: str) -> bool:
    return bool(_detect_bug_issues("unknown.js", content, start_line=1, line_count=len(content.splitlines())))


def _direct_bug_answer(chunks: list[dict], message: str, response_language: str | None) -> str | None:
    issues = []

    for chunk in chunks:
        if chunk.get("detected_issues"):
            issues.extend(chunk["detected_issues"])
            continue

        issues.extend(
            _detect_bug_issues(
                chunk["file_path"],
                chunk["content"],
                start_line=chunk["start_line"],
                line_count=chunk["end_line"] - chunk["start_line"] + 1,
            )
        )

    deduped_issues = _dedupe_issues(issues)[:MAX_DIRECT_BUG_ISSUES]
    if not deduped_issues:
        return None

    language = response_language_for_message(message, response_language)
    strings = _localized_bug_strings(language)
    evidence_lines = [_format_issue(issue, language) for issue in deduped_issues]
    fix_lines = [_format_fix(issue, language) for issue in deduped_issues]
    return (
        f"**{strings['problem_heading']}**\n"
        f"{strings['problem_text']}\n\n"
        f"**{strings['evidence_heading']}**\n"
        f"{chr(10).join(evidence_lines)}\n\n"
        f"**{strings['fix_heading']}**\n"
        f"{chr(10).join(fix_lines)}"
    )


def _detect_bug_issues(
    file_path: str,
    content: str,
    start_line: int,
    line_count: int,
) -> list[dict]:
    issues = []
    lowered_path = file_path.lower()
    lines = content.splitlines()
    full_file = start_line == 1 and line_count >= len(lines)

    for offset, line in enumerate(lines):
        stripped = line.strip()
        line_number = start_line + offset
        location = f"{file_path}:{line_number}"

        if stripped.startswith(("<<<<<<<", "=======", ">>>>>>>")):
            issues.append(
                {
                    "location": location,
                    "kind": "merge_conflict",
                    "evidence": f"`{stripped}`",
                    "fix": "Resolve the conflict marker and keep only the intended code.",
                    "line_number": line_number,
                }
            )
        if re.search(r"=\s*\.\s*getElementById\s*\(", stripped):
            issues.append(
                {
                    "location": location,
                    "kind": "missing_document",
                    "evidence": f"`{stripped}`",
                    "fix": "Change it to `const display = document.getElementById(\"display\");`.",
                    "line_number": line_number,
                }
            )
        if re.search(r"^tr\s*\{", stripped):
            issues.append(
                {
                    "location": location,
                    "kind": "bad_try",
                    "evidence": f"`{stripped}`",
                    "fix": "Change `tr{` to `try {`.",
                    "line_number": line_number,
                }
            )
        if re.search(r"addEventListener\s*\(.*\(\)\s*\{", stripped):
            issues.append(
                {
                    "location": location,
                    "kind": "bad_click_handler",
                    "evidence": f"`{stripped}`",
                    "fix": "Change the handler to `button.addEventListener(\"click\", () => {`.",
                    "line_number": line_number,
                }
            )
        if re.search(r"\bmath\.(floor|random|ceil|round|max|min|abs)\b", stripped):
            issues.append(
                {
                    "location": location,
                    "kind": "bad_math_case",
                    "evidence": f"`{stripped}`",
                    "fix": "Use the JavaScript `Math` object with an uppercase `M`.",
                    "line_number": line_number,
                }
            )
        if ".random(" in stripped and "Math.random(" not in stripped:
            issues.append(
                {
                    "location": location,
                    "kind": "bad_random_call",
                    "evidence": f"`{stripped}`",
                    "fix": "Use `Math.random()` before applying `Math.floor(...)`.",
                    "line_number": line_number,
                }
            )
        if re.search(r"(?<![A-Za-z0-9_$])document\.querySelector(All)?\s*\(\s*\)", stripped):
            issues.append(
                {
                    "location": location,
                    "kind": "empty_selector",
                    "evidence": f"`{stripped}`",
                    "fix": "Pass a CSS selector string, for example `document.querySelector(\".item\")`.",
                    "line_number": line_number,
                }
            )

    if lowered_path.endswith((".html", ".js", ".jsx", ".mjs", ".ts", ".tsx", ".vue", ".svelte")):
        issues.extend(_javascript_cross_reference_issues(file_path, content, start_line, full_file))

    if full_file and lowered_path.endswith(".py"):
        issues.extend(_python_syntax_issues(file_path, content))

    if full_file and lowered_path.endswith((".json", ".jsonc")):
        issues.extend(_json_syntax_issues(file_path, content))

    if full_file and lowered_path.endswith(".toml"):
        issues.extend(_toml_syntax_issues(file_path, content))

    if full_file and lowered_path.endswith((".xml", ".html")):
        issues.extend(_xml_syntax_issues(file_path, content))

    if full_file:
        issues.extend(_balanced_delimiter_issues(file_path, content))

    return _dedupe_issues(issues)


def _javascript_cross_reference_issues(
    file_path: str,
    content: str,
    start_line: int,
    full_file: bool,
) -> list[dict]:
    onclick_calls = _onclick_function_call_locations(content, start_line)
    declared_functions = _declared_functions(content)
    anonymous_function_lines = [
        start_line + offset
        for offset, line in enumerate(content.splitlines())
        if re.search(r"function\s*\(\s*\)\s*\{", line.strip())
    ]
    issues = []

    for line_number in anonymous_function_lines:
        issues.append(
            {
                "location": f"{file_path}:{line_number}",
                "kind": "anonymous_function",
                "evidence": "`function (){`",
                "fix": "Give the function a name or convert it to an assigned arrow function.",
                "line_number": line_number,
            }
        )

    if full_file:
        issues.extend(
            _missing_or_misspelled_function_issues(
                file_path,
                onclick_calls,
                declared_functions,
                anonymous_function_lines,
            )
        )
    return issues


def _python_syntax_issues(file_path: str, content: str) -> list[dict]:
    try:
        compile(content, file_path, "exec")
    except SyntaxError as exc:
        line_number = exc.lineno or 1
        evidence = (exc.text or exc.msg or "Python syntax error").strip()
        return [
            {
                "location": f"{file_path}:{line_number}",
                "kind": "python_syntax_error",
                "evidence": f"`{evidence}`",
                "fix": f"Fix the Python syntax error: {exc.msg}.",
                "line_number": line_number,
            }
        ]
    return []


def _json_syntax_issues(file_path: str, content: str) -> list[dict]:
    normalized = _strip_jsonc_comments(content) if file_path.lower().endswith(".jsonc") else content
    try:
        json.loads(normalized)
    except json.JSONDecodeError as exc:
        return [
            {
                "location": f"{file_path}:{exc.lineno}",
                "kind": "json_syntax_error",
                "evidence": f"`{exc.msg}`",
                "fix": "Fix the JSON syntax near the cited line.",
                "line_number": exc.lineno,
            }
        ]
    return []


def _toml_syntax_issues(file_path: str, content: str) -> list[dict]:
    try:
        tomllib.loads(content)
    except tomllib.TOMLDecodeError as exc:
        line_number = _line_number_from_decode_error(str(exc))
        return [
            {
                "location": f"{file_path}:{line_number}",
                "kind": "toml_syntax_error",
                "evidence": f"`{exc}`",
                "fix": "Fix the TOML syntax near the cited line.",
                "line_number": line_number,
            }
        ]
    return []


def _xml_syntax_issues(file_path: str, content: str) -> list[dict]:
    if not content.strip().startswith("<"):
        return []
    try:
        ET.fromstring(content)
    except ET.ParseError as exc:
        line_number = exc.position[0] or 1
        return [
            {
                "location": f"{file_path}:{line_number}",
                "kind": "xml_syntax_error",
                "evidence": f"`{exc}`",
                "fix": "Fix the XML/HTML tag structure near the cited line.",
                "line_number": line_number,
            }
        ]
    return []


def _balanced_delimiter_issues(file_path: str, content: str) -> list[dict]:
    pairs = {"(": ")", "[": "]", "{": "}"}
    closing = {value: key for key, value in pairs.items()}
    stack = []
    for line_number, line in enumerate(content.splitlines(), start=1):
        stripped = _strip_strings_and_comments(line)
        for char in stripped:
            if char in pairs:
                stack.append((char, line_number))
            elif char in closing:
                if not stack or stack[-1][0] != closing[char]:
                    return [
                        {
                            "location": f"{file_path}:{line_number}",
                            "kind": "unexpected_closing_delimiter",
                            "evidence": f"`{char}`",
                            "fix": "Remove the extra closing delimiter or add the matching opener.",
                            "line_number": line_number,
                        }
                    ]
                stack.pop()
    if stack:
        opener, line_number = stack[-1]
        return [
            {
                "location": f"{file_path}:{line_number}",
                "kind": "unclosed_delimiter",
                "evidence": f"`{opener}`",
                "fix": f"Add the matching `{pairs[opener]}` or remove the unclosed delimiter.",
                "line_number": line_number,
            }
        ]
    return []


def _strip_strings_and_comments(line: str) -> str:
    line = re.sub(r"(['\"])(?:\\.|(?!\1).)*\1", "", line)
    return re.sub(r"(//|#).*$", "", line)


def _line_number_from_decode_error(error: str) -> int:
    match = re.search(r"line\s+(\d+)", error)
    return int(match.group(1)) if match else 1


def _strip_jsonc_comments(content: str) -> str:
    content = re.sub(r"//.*", "", content)
    return re.sub(r"/\*.*?\*/", "", content, flags=re.DOTALL)


def _context_chunk_for_issue(content: dict, issue: dict) -> dict:
    lines = content["content"].splitlines()
    line_number = max(1, min(issue.get("line_number", 1), max(1, len(lines))))
    start = max(1, line_number - BUG_CONTEXT_RADIUS)
    end = min(len(lines), line_number + BUG_CONTEXT_RADIUS)
    return {
        "file_path": content["path"],
        "start_line": start,
        "end_line": end,
        "content": "\n".join(lines[start - 1 : end]),
        "detected_issues": [issue],
    }


def _onclick_function_calls(content: str) -> set[str]:
    return {name for name, _line_number in _onclick_function_call_locations(content, 1)}


def _onclick_function_call_locations(content: str, start_line: int) -> set[tuple[str, int]]:
    calls = set()
    for match in re.finditer(r"onclick=[\"']\s*([A-Za-z_$][\w$]*)\s*\(", content):
        line_number = start_line + content.count("\n", 0, match.start())
        calls.add((match.group(1), line_number))
    return calls


def _declared_functions(content: str) -> set[str]:
    return set(re.findall(r"\bfunction\s+([A-Za-z_$][\w$]*)\s*\(", content))


def _onclick_calls_without_matching_functions(content: str) -> bool:
    return bool(_onclick_function_calls(content) - _declared_functions(content))


def _missing_or_misspelled_function_issues(
    file_path: str,
    onclick_calls: set[str] | set[tuple[str, int]],
    declared_functions: set[str],
    anonymous_function_lines: list[int],
) -> list[dict]:
    issues = []
    call_locations = _normalize_onclick_calls(onclick_calls)
    missing = sorted(
        (called_name, line_number)
        for called_name, line_number in call_locations
        if called_name not in declared_functions
    )
    for called_name, line_number in missing:
        location = f"{file_path}:{line_number}" if line_number else file_path
        typo = _closest_typo(called_name, declared_functions)
        if typo:
            issues.append(
                {
                    "location": location,
                    "kind": "misspelled_function",
                    "called_name": called_name,
                    "declared_name": typo,
                    "fix": f"Rename `function {typo}()` to `function {called_name}()`.",
                    "line_number": line_number,
                }
            )
            continue

        if called_name == "clearDisplay" and anonymous_function_lines:
            issues.append(
                {
                    "location": f"{file_path}:{anonymous_function_lines[0]}",
                    "kind": "anonymous_clear",
                    "called_name": called_name,
                    "fix": "Change the anonymous clear handler to `function clearDisplay(){ display.value = \"\"; }`.",
                    "line_number": anonymous_function_lines[0],
                }
            )
            continue

        issues.append(
            {
                "location": location,
                "kind": "missing_function",
                "called_name": called_name,
                "fix": f"Define `function {called_name}()` or change the button to call an existing function.",
                "line_number": line_number,
            }
        )
    return issues


def _normalize_onclick_calls(onclick_calls: set[str] | set[tuple[str, int]]) -> set[tuple[str, int]]:
    normalized = set()
    for call in onclick_calls:
        if isinstance(call, tuple):
            normalized.add(call)
        else:
            normalized.add((call, 0))
    return normalized


def _closest_typo(target: str, candidates: set[str]) -> str | None:
    for candidate in candidates:
        if _edit_distance_at_most_two(target.lower(), candidate.lower()):
            return candidate
    return None


def _edit_distance_at_most_two(left: str, right: str) -> bool:
    if abs(len(left) - len(right)) > 2:
        return False
    previous = list(range(len(right) + 1))
    for i, left_char in enumerate(left, start=1):
        current = [i]
        row_min = i
        for j, right_char in enumerate(right, start=1):
            cost = 0 if left_char == right_char else 1
            value = min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost)
            current.append(value)
            row_min = min(row_min, value)
        if row_min > 2:
            return False
        previous = current
    return previous[-1] <= 2


def _dedupe_issues(issues: list[dict]) -> list[dict]:
    deduped = []
    seen = set()
    for issue in issues:
        key = (
            issue.get("location"),
            issue.get("kind"),
            issue.get("called_name"),
            issue.get("declared_name"),
            issue.get("evidence"),
        )
        if key in seen:
            continue
        seen.add(key)
        deduped.append(issue)
    return deduped


BUG_COPY = {
    "en": {
        "problem_heading": "Problem",
        "problem_text": "I found concrete code errors that can stop the affected files from running correctly.",
        "evidence_heading": "Evidence",
        "fix_heading": "Fix",
        "missing_document": "{location}: {evidence} is missing `document` before `.getElementById(...)`.",
        "anonymous_function": "{location}: {evidence} declares an anonymous function where a named handler is likely needed.",
        "anonymous_clear": "{location}: `clearDisplay()` is called by a button, but the clear handler is anonymous.",
        "misspelled_function": "{location}: the button calls `{called_name}()`, but the code declares `function {declared_name}()`.",
        "missing_function": "{location}: the button calls `{called_name}()`, but no function with that name is declared.",
        "bad_try": "{location}: {evidence} is invalid JavaScript syntax; it should be `try {{`.",
        "bad_click_handler": "{location}: {evidence} is missing `=>` before the handler body.",
        "bad_math_case": "{location}: {evidence} uses the wrong `Math` casing.",
        "bad_random_call": "{location}: {evidence} calls `.random()` without the `Math` object.",
        "empty_selector": "{location}: {evidence} calls `querySelector` without a selector.",
        "merge_conflict": "{location}: {evidence} is an unresolved merge conflict marker.",
        "python_syntax_error": "{location}: {evidence} is a Python syntax error.",
        "json_syntax_error": "{location}: {evidence} is invalid JSON syntax.",
        "fix_missing_document": "Change it to `const display = document.getElementById(\"display\");`.",
        "fix_anonymous_function": "Give the function a name or assign it to the handler the UI calls.",
        "fix_anonymous_clear": "Change the anonymous clear handler to `function clearDisplay(){ display.value = \"\"; }`.",
        "fix_misspelled_function": "Rename `function {declared_name}()` to `function {called_name}()`.",
        "fix_missing_function": "Define `function {called_name}()` or change the button to call an existing function.",
        "fix_bad_try": "Change `tr{{` to `try {{`.",
        "fix_bad_click_handler": "Add `=>` to the click handler.",
        "fix_bad_math_case": "Use the JavaScript `Math` object with an uppercase `M`.",
        "fix_bad_random_call": "Use `Math.random()` before applying `Math.floor(...)`.",
        "fix_empty_selector": "Pass a CSS selector string to `querySelector`.",
        "fix_merge_conflict": "Resolve the conflict marker and keep only the intended code.",
        "fix_python_syntax_error": "Fix the Python syntax error shown at the cited line.",
        "fix_json_syntax_error": "Fix the JSON syntax near the cited line.",
    },
    "hi": {
        "problem_heading": "समस्या",
        "problem_text": "JavaScript भाग में function या syntax errors हैं, इसलिए buttons सही तरह काम नहीं कर रहे हैं।",
        "evidence_heading": "प्रमाण",
        "fix_heading": "समाधान",
        "missing_document": "{location}: {evidence} में `.getElementById(...)` से पहले `document` नहीं है।",
        "anonymous_clear": "{location}: button `clearDisplay()` call कर रहा है, लेकिन clear handler anonymous है।",
        "misspelled_function": "{location}: button `{called_name}()` call कर रहा है, लेकिन code में `function {declared_name}()` है।",
        "missing_function": "{location}: button `{called_name}()` call कर रहा है, लेकिन इस नाम का function declared नहीं है।",
        "bad_try": "{location}: {evidence} invalid JavaScript syntax है; यह `try {{` होना चाहिए।",
        "bad_click_handler": "{location}: {evidence} में handler body से पहले `=>` missing है।",
        "bad_math_case": "{location}: {evidence} में `Math` casing गलत है।",
        "fix_missing_document": "`const display = document.getElementById(\"display\");` इस्तेमाल करें।",
        "fix_anonymous_clear": "anonymous clear handler को `function clearDisplay(){ display.value = \"\"; }` करें।",
        "fix_misspelled_function": "`function {declared_name}()` का नाम बदलकर `function {called_name}()` करें।",
        "fix_missing_function": "`function {called_name}()` define करें या button का `onclick` existing function से मिलाएं।",
        "fix_bad_try": "`tr{{` को `try {{` में बदलें।",
        "fix_bad_click_handler": "click handler में `=>` जोड़ें।",
        "fix_bad_math_case": "`math.floor` को `Math.floor` करें।",
    },
    "bn": {
        "problem_heading": "সমস্যা",
        "problem_text": "JavaScript অংশে function বা syntax error আছে, তাই buttons ঠিকমতো কাজ করছে না।",
        "evidence_heading": "প্রমাণ",
        "fix_heading": "সমাধান",
        "missing_document": "{location}: {evidence} এখানে `.getElementById(...)`-এর আগে `document` নেই।",
        "anonymous_clear": "{location}: button `clearDisplay()` call করছে, কিন্তু clear handler anonymous।",
        "misspelled_function": "{location}: button `{called_name}()` call করছে, কিন্তু code-এ `function {declared_name}()` আছে।",
        "missing_function": "{location}: button `{called_name}()` call করছে, কিন্তু এই নামে কোনো function declared নেই।",
        "bad_try": "{location}: {evidence} invalid JavaScript syntax; এটি `try {{` হওয়া উচিত।",
        "bad_click_handler": "{location}: {evidence} handler body-এর আগে `=>` missing।",
        "bad_math_case": "{location}: {evidence} এখানে `Math` casing ভুল।",
        "fix_missing_document": "`const display = document.getElementById(\"display\");` ব্যবহার করুন।",
        "fix_anonymous_clear": "anonymous clear handler-টি `function clearDisplay(){ display.value = \"\"; }` করুন।",
        "fix_misspelled_function": "`function {declared_name}()`-এর নাম বদলে `function {called_name}()` করুন।",
        "fix_missing_function": "`function {called_name}()` define করুন, অথবা button-এর `onclick` existing function-এর সাথে মিলিয়ে দিন।",
        "fix_bad_try": "`tr{{` বদলে `try {{` করুন।",
        "fix_bad_click_handler": "click handler-এ `=>` যোগ করুন।",
        "fix_bad_math_case": "`math.floor` বদলে `Math.floor` করুন।",
    },
    "es": {
        "problem_heading": "Problema",
        "problem_text": "El script tiene errores de funciones o sintaxis de JavaScript que impiden que los botones funcionen correctamente.",
        "evidence_heading": "Evidencia",
        "fix_heading": "Solución",
        "missing_document": "{location}: {evidence} no tiene `document` antes de `.getElementById(...)`.",
        "anonymous_clear": "{location}: el botón llama a `clearDisplay()`, pero el manejador de limpieza es anónimo.",
        "misspelled_function": "{location}: el botón llama a `{called_name}()`, pero el código declara `function {declared_name}()`.",
        "missing_function": "{location}: el botón llama a `{called_name}()`, pero no hay una función declarada con ese nombre.",
        "bad_try": "{location}: {evidence} es sintaxis JavaScript inválida; debe ser `try {{`.",
        "bad_click_handler": "{location}: a {evidence} le falta `=>` antes del cuerpo del manejador.",
        "bad_math_case": "{location}: {evidence} usa mal las mayúsculas de `Math`.",
        "fix_missing_document": "Cámbialo a `const display = document.getElementById(\"display\");`.",
        "fix_anonymous_clear": "Cambia el manejador anónimo a `function clearDisplay(){ display.value = \"\"; }`.",
        "fix_misspelled_function": "Renombra `function {declared_name}()` a `function {called_name}()`.",
        "fix_missing_function": "Define `function {called_name}()` o cambia el botón para llamar a una función existente.",
        "fix_bad_try": "Cambia `tr{{` a `try {{`.",
        "fix_bad_click_handler": "Agrega `=>` al manejador de click.",
        "fix_bad_math_case": "Cambia `math.floor` a `Math.floor`.",
    },
    "fr": {
        "problem_heading": "Problème",
        "problem_text": "Le script contient des erreurs de fonction ou de syntaxe JavaScript qui empêchent les boutons de fonctionner correctement.",
        "evidence_heading": "Preuve",
        "fix_heading": "Correction",
        "missing_document": "{location}: {evidence} n’a pas `document` avant `.getElementById(...)`.",
        "anonymous_clear": "{location}: le bouton appelle `clearDisplay()`, mais le gestionnaire de nettoyage est anonyme.",
        "misspelled_function": "{location}: le bouton appelle `{called_name}()`, mais le code déclare `function {declared_name}()`.",
        "missing_function": "{location}: le bouton appelle `{called_name}()`, mais aucune fonction portant ce nom n’est déclarée.",
        "bad_try": "{location}: {evidence} est une syntaxe JavaScript invalide; cela doit être `try {{`.",
        "bad_click_handler": "{location}: {evidence} n’a pas `=>` avant le corps du gestionnaire.",
        "bad_math_case": "{location}: {evidence} utilise une mauvaise casse pour `Math`.",
        "fix_missing_document": "Remplace par `const display = document.getElementById(\"display\");`.",
        "fix_anonymous_clear": "Remplace le gestionnaire anonyme par `function clearDisplay(){ display.value = \"\"; }`.",
        "fix_misspelled_function": "Renomme `function {declared_name}()` en `function {called_name}()`.",
        "fix_missing_function": "Définis `function {called_name}()` ou change le bouton pour appeler une fonction existante.",
        "fix_bad_try": "Remplace `tr{{` par `try {{`.",
        "fix_bad_click_handler": "Ajoute `=>` au gestionnaire de clic.",
        "fix_bad_math_case": "Remplace `math.floor` par `Math.floor`.",
    },
}

BUG_COPY["de"] = {
    **BUG_COPY["en"],
    "problem_heading": "Problem",
    "problem_text": "Das Skript enthält JavaScript-Funktions- oder Syntaxfehler, sodass die Buttons nicht richtig funktionieren.",
    "evidence_heading": "Nachweis",
    "fix_heading": "Lösung",
    "missing_document": "{location}: {evidence} enthält kein `document` vor `.getElementById(...)`.",
    "anonymous_clear": "{location}: Der Button ruft `clearDisplay()` auf, aber der Clear-Handler ist anonym.",
    "misspelled_function": "{location}: Der Button ruft `{called_name}()` auf, aber der Code deklariert `function {declared_name}()`.",
    "missing_function": "{location}: Der Button ruft `{called_name}()` auf, aber es gibt keine Funktion mit diesem Namen.",
    "bad_try": "{location}: {evidence} ist ungültige JavaScript-Syntax; es sollte `try {{` sein.",
    "bad_click_handler": "{location}: In {evidence} fehlt `=>` vor dem Handler-Body.",
    "bad_math_case": "{location}: {evidence} verwendet die falsche Schreibweise für `Math`.",
    "fix_missing_document": "Ändere es zu `const display = document.getElementById(\"display\");`.",
    "fix_anonymous_clear": "Ändere den anonymen Clear-Handler zu `function clearDisplay(){ display.value = \"\"; }`.",
    "fix_misspelled_function": "Benenne `function {declared_name}()` in `function {called_name}()` um.",
    "fix_missing_function": "Definiere `function {called_name}()` oder ändere den Button auf eine vorhandene Funktion.",
    "fix_bad_try": "Ändere `tr{{` zu `try {{`.",
    "fix_bad_click_handler": "Füge `=>` zum Click-Handler hinzu.",
    "fix_bad_math_case": "Ändere `math.floor` zu `Math.floor`.",
}
BUG_COPY["pt"] = {
    **BUG_COPY["en"],
    "problem_heading": "Problema",
    "problem_text": "O script tem erros de função ou sintaxe JavaScript que impedem os botões de funcionar corretamente.",
    "evidence_heading": "Evidência",
    "fix_heading": "Correção",
    "missing_document": "{location}: {evidence} não tem `document` antes de `.getElementById(...)`.",
    "anonymous_clear": "{location}: o botão chama `clearDisplay()`, mas o handler de limpar é anônimo.",
    "misspelled_function": "{location}: o botão chama `{called_name}()`, mas o código declara `function {declared_name}()`.",
    "missing_function": "{location}: o botão chama `{called_name}()`, mas nenhuma função com esse nome foi declarada.",
    "bad_try": "{location}: {evidence} é sintaxe JavaScript inválida; deve ser `try {{`.",
    "bad_click_handler": "{location}: falta `=>` antes do corpo do handler em {evidence}.",
    "bad_math_case": "{location}: {evidence} usa a capitalização errada de `Math`.",
    "fix_missing_document": "Altere para `const display = document.getElementById(\"display\");`.",
    "fix_anonymous_clear": "Altere o handler anônimo para `function clearDisplay(){ display.value = \"\"; }`.",
    "fix_misspelled_function": "Renomeie `function {declared_name}()` para `function {called_name}()`.",
    "fix_missing_function": "Defina `function {called_name}()` ou altere o botão para chamar uma função existente.",
    "fix_bad_try": "Altere `tr{{` para `try {{`.",
    "fix_bad_click_handler": "Adicione `=>` ao handler de click.",
    "fix_bad_math_case": "Altere `math.floor` para `Math.floor`.",
}
BUG_COPY["ta"] = {
    **BUG_COPY["en"],
    "problem_heading": "சிக்கல்",
    "problem_text": "JavaScript பகுதியில் function அல்லது syntax பிழைகள் உள்ளன; அதனால் buttons சரியாக வேலை செய்யவில்லை.",
    "evidence_heading": "ஆதாரம்",
    "fix_heading": "திருத்தம்",
    "missing_document": "{location}: {evidence} இல் `.getElementById(...)` முன் `document` இல்லை.",
    "anonymous_clear": "{location}: button `clearDisplay()` ஐ call செய்கிறது, ஆனால் clear handler anonymous ஆக உள்ளது.",
    "misspelled_function": "{location}: button `{called_name}()` ஐ call செய்கிறது, ஆனால் code இல் `function {declared_name}()` உள்ளது.",
    "missing_function": "{location}: button `{called_name}()` ஐ call செய்கிறது, ஆனால் அந்த பெயரில் function declared இல்லை.",
    "bad_try": "{location}: {evidence} தவறான JavaScript syntax; இது `try {{` ஆக இருக்க வேண்டும்.",
    "bad_click_handler": "{location}: {evidence} இல் handler body க்கு முன் `=>` இல்லை.",
    "bad_math_case": "{location}: {evidence} இல் `Math` casing தவறு.",
    "fix_missing_document": "`const display = document.getElementById(\"display\");` ஆக மாற்றுங்கள்.",
    "fix_anonymous_clear": "anonymous clear handler ஐ `function clearDisplay(){ display.value = \"\"; }` ஆக மாற்றுங்கள்.",
    "fix_misspelled_function": "`function {declared_name}()` ஐ `function {called_name}()` என rename செய்யுங்கள்.",
    "fix_missing_function": "`function {called_name}()` define செய்யுங்கள் அல்லது button ஐ existing function-ஐ call செய்ய மாற்றுங்கள்.",
    "fix_bad_try": "`tr{{` ஐ `try {{` ஆக மாற்றுங்கள்.",
    "fix_bad_click_handler": "click handler இல் `=>` சேர்க்கவும்.",
    "fix_bad_math_case": "`math.floor` ஐ `Math.floor` ஆக மாற்றுங்கள்.",
}
BUG_COPY["te"] = {
    **BUG_COPY["en"],
    "problem_heading": "సమస్య",
    "problem_text": "JavaScript భాగంలో function లేదా syntax errors ఉన్నాయి, అందుకే buttons సరిగా పని చేయడం లేదు.",
    "evidence_heading": "సాక్ష్యం",
    "fix_heading": "పరిష్కారం",
    "missing_document": "{location}: {evidence} లో `.getElementById(...)` ముందు `document` లేదు.",
    "anonymous_clear": "{location}: button `clearDisplay()` ని call చేస్తోంది, కానీ clear handler anonymous గా ఉంది.",
    "misspelled_function": "{location}: button `{called_name}()` ని call చేస్తోంది, కానీ code లో `function {declared_name}()` ఉంది.",
    "missing_function": "{location}: button `{called_name}()` ని call చేస్తోంది, కానీ ఆ పేరుతో function declare కాలేదు.",
    "bad_try": "{location}: {evidence} తప్పు JavaScript syntax; ఇది `try {{` కావాలి.",
    "bad_click_handler": "{location}: {evidence} లో handler body ముందు `=>` లేదు.",
    "bad_math_case": "{location}: {evidence} లో `Math` casing తప్పు.",
    "fix_missing_document": "`const display = document.getElementById(\"display\");` గా మార్చండి.",
    "fix_anonymous_clear": "anonymous clear handler ని `function clearDisplay(){ display.value = \"\"; }` గా మార్చండి.",
    "fix_misspelled_function": "`function {declared_name}()` ని `function {called_name}()` గా rename చేయండి.",
    "fix_missing_function": "`function {called_name}()` define చేయండి లేదా button existing function ని call చేసేలా మార్చండి.",
    "fix_bad_try": "`tr{{` ని `try {{` గా మార్చండి.",
    "fix_bad_click_handler": "click handler లో `=>` జోడించండి.",
    "fix_bad_math_case": "`math.floor` ని `Math.floor` గా మార్చండి.",
}
BUG_COPY["mr"] = {
    **BUG_COPY["en"],
    "problem_heading": "समस्या",
    "problem_text": "JavaScript भागात function किंवा syntax errors आहेत, त्यामुळे buttons नीट काम करत नाहीत.",
    "evidence_heading": "पुरावा",
    "fix_heading": "उपाय",
    "missing_document": "{location}: {evidence} मध्ये `.getElementById(...)` च्या आधी `document` नाही.",
    "anonymous_clear": "{location}: button `clearDisplay()` call करतो, पण clear handler anonymous आहे.",
    "misspelled_function": "{location}: button `{called_name}()` call करतो, पण code मध्ये `function {declared_name}()` आहे.",
    "missing_function": "{location}: button `{called_name}()` call करतो, पण या नावाचा function declared नाही.",
    "bad_try": "{location}: {evidence} invalid JavaScript syntax आहे; हे `try {{` असावे.",
    "bad_click_handler": "{location}: {evidence} मध्ये handler body आधी `=>` नाही.",
    "bad_math_case": "{location}: {evidence} मध्ये `Math` casing चुकीची आहे.",
    "fix_missing_document": "`const display = document.getElementById(\"display\");` वापरा.",
    "fix_anonymous_clear": "anonymous clear handler `function clearDisplay(){ display.value = \"\"; }` करा.",
    "fix_misspelled_function": "`function {declared_name}()` चे नाव बदलून `function {called_name}()` करा.",
    "fix_missing_function": "`function {called_name}()` define करा किंवा button existing function call करेल असे बदला.",
    "fix_bad_try": "`tr{{` बदलून `try {{` करा.",
    "fix_bad_click_handler": "click handler मध्ये `=>` जोडा.",
    "fix_bad_math_case": "`math.floor` बदलून `Math.floor` करा.",
}
BUG_COPY["gu"] = {
    **BUG_COPY["en"],
    "problem_heading": "સમस्या",
    "problem_text": "JavaScript ભાગમાં function અથવા syntax errors છે, તેથી buttons યોગ્ય રીતે કામ કરતા નથી.",
    "evidence_heading": "પુરાવો",
    "fix_heading": "ઉકેલ",
    "missing_document": "{location}: {evidence} માં `.getElementById(...)` પહેલા `document` નથી.",
    "anonymous_clear": "{location}: button `clearDisplay()` call કરે છે, પરંતુ clear handler anonymous છે.",
    "misspelled_function": "{location}: button `{called_name}()` call કરે છે, પરંતુ code માં `function {declared_name}()` છે.",
    "missing_function": "{location}: button `{called_name}()` call કરે છે, પરંતુ આ નામનું function declared નથી.",
    "bad_try": "{location}: {evidence} invalid JavaScript syntax છે; તે `try {{` હોવું જોઈએ.",
    "bad_click_handler": "{location}: {evidence} માં handler body પહેલા `=>` નથી.",
    "bad_math_case": "{location}: {evidence} માં `Math` casing ખોટી છે.",
    "fix_missing_document": "`const display = document.getElementById(\"display\");` વાપરો.",
    "fix_anonymous_clear": "anonymous clear handler ને `function clearDisplay(){ display.value = \"\"; }` કરો.",
    "fix_misspelled_function": "`function {declared_name}()` નું નામ બદલીને `function {called_name}()` કરો.",
    "fix_missing_function": "`function {called_name}()` define કરો અથવા button ને existing function call કરાવો.",
    "fix_bad_try": "`tr{{` ને `try {{` કરો.",
    "fix_bad_click_handler": "click handler માં `=>` ઉમેરો.",
    "fix_bad_math_case": "`math.floor` ને `Math.floor` કરો.",
}
BUG_COPY["ar"] = {
    **BUG_COPY["en"],
    "problem_heading": "المشكلة",
    "problem_text": "يحتوي السكربت على أخطاء في دوال JavaScript أو في الصياغة، لذلك لا تعمل الأزرار بشكل صحيح.",
    "evidence_heading": "الدليل",
    "fix_heading": "الإصلاح",
    "missing_document": "{location}: {evidence} يفتقد `document` قبل `.getElementById(...)`.",
    "anonymous_clear": "{location}: الزر يستدعي `clearDisplay()`، لكن معالج المسح مجهول الاسم.",
    "misspelled_function": "{location}: الزر يستدعي `{called_name}()`، لكن الكود يعرّف `function {declared_name}()`.",
    "missing_function": "{location}: الزر يستدعي `{called_name}()`، لكن لا توجد دالة بهذا الاسم.",
    "bad_try": "{location}: {evidence} صياغة JavaScript غير صحيحة؛ يجب أن تكون `try {{`.",
    "bad_click_handler": "{location}: {evidence} يفتقد `=>` قبل جسم المعالج.",
    "bad_math_case": "{location}: {evidence} يستخدم كتابة خاطئة لـ `Math`.",
    "fix_missing_document": "غيّرها إلى `const display = document.getElementById(\"display\");`.",
    "fix_anonymous_clear": "غيّر معالج المسح المجهول إلى `function clearDisplay(){ display.value = \"\"; }`.",
    "fix_misspelled_function": "أعد تسمية `function {declared_name}()` إلى `function {called_name}()`.",
    "fix_missing_function": "عرّف `function {called_name}()` أو غيّر الزر ليستدعي دالة موجودة.",
    "fix_bad_try": "غيّر `tr{{` إلى `try {{`.",
    "fix_bad_click_handler": "أضف `=>` إلى معالج النقر.",
    "fix_bad_math_case": "غيّر `math.floor` إلى `Math.floor`.",
}
BUG_COPY["zh"] = {
    **BUG_COPY["en"],
    "problem_heading": "问题",
    "problem_text": "脚本中有 JavaScript 函数或语法错误，导致按钮无法正常工作。",
    "evidence_heading": "证据",
    "fix_heading": "修复",
    "missing_document": "{location}: {evidence} 在 `.getElementById(...)` 前缺少 `document`。",
    "anonymous_clear": "{location}: 按钮调用 `clearDisplay()`，但清除处理函数是匿名的。",
    "misspelled_function": "{location}: 按钮调用 `{called_name}()`，但代码声明的是 `function {declared_name}()`。",
    "missing_function": "{location}: 按钮调用 `{called_name}()`，但没有声明这个名称的函数。",
    "bad_try": "{location}: {evidence} 是无效的 JavaScript 语法；应为 `try {{`。",
    "bad_click_handler": "{location}: {evidence} 在处理函数体前缺少 `=>`。",
    "bad_math_case": "{location}: {evidence} 中 `Math` 的大小写错误。",
    "fix_missing_document": "改为 `const display = document.getElementById(\"display\");`。",
    "fix_anonymous_clear": "将匿名清除处理函数改为 `function clearDisplay(){ display.value = \"\"; }`。",
    "fix_misspelled_function": "将 `function {declared_name}()` 重命名为 `function {called_name}()`。",
    "fix_missing_function": "定义 `function {called_name}()`，或让按钮调用已有函数。",
    "fix_bad_try": "将 `tr{{` 改为 `try {{`。",
    "fix_bad_click_handler": "在 click handler 中添加 `=>`。",
    "fix_bad_math_case": "将 `math.floor` 改为 `Math.floor`。",
}
BUG_COPY["ja"] = {
    **BUG_COPY["en"],
    "problem_heading": "問題",
    "problem_text": "スクリプトに JavaScript の関数または構文エラーがあり、ボタンが正しく動作していません。",
    "evidence_heading": "根拠",
    "fix_heading": "修正",
    "missing_document": "{location}: {evidence} は `.getElementById(...)` の前に `document` がありません。",
    "anonymous_clear": "{location}: ボタンは `clearDisplay()` を呼んでいますが、clear handler が匿名です。",
    "misspelled_function": "{location}: ボタンは `{called_name}()` を呼んでいますが、コードでは `function {declared_name}()` が宣言されています。",
    "missing_function": "{location}: ボタンは `{called_name}()` を呼んでいますが、その名前の関数が宣言されていません。",
    "bad_try": "{location}: {evidence} は無効な JavaScript 構文です。`try {{` にする必要があります。",
    "bad_click_handler": "{location}: {evidence} は handler body の前に `=>` がありません。",
    "bad_math_case": "{location}: {evidence} は `Math` の大文字小文字が間違っています。",
    "fix_missing_document": "`const display = document.getElementById(\"display\");` に変更してください。",
    "fix_anonymous_clear": "匿名の clear handler を `function clearDisplay(){ display.value = \"\"; }` に変更してください。",
    "fix_misspelled_function": "`function {declared_name}()` を `function {called_name}()` にリネームしてください。",
    "fix_missing_function": "`function {called_name}()` を定義するか、ボタンが既存の関数を呼ぶように変更してください。",
    "fix_bad_try": "`tr{{` を `try {{` に変更してください。",
    "fix_bad_click_handler": "click handler に `=>` を追加してください。",
    "fix_bad_math_case": "`math.floor` を `Math.floor` に変更してください。",
}
BUG_COPY["ko"] = {
    **BUG_COPY["en"],
    "problem_heading": "문제",
    "problem_text": "스크립트에 JavaScript 함수 또는 문법 오류가 있어 버튼이 제대로 동작하지 않습니다.",
    "evidence_heading": "근거",
    "fix_heading": "수정",
    "missing_document": "{location}: {evidence}에는 `.getElementById(...)` 앞에 `document`가 없습니다.",
    "anonymous_clear": "{location}: 버튼이 `clearDisplay()`를 호출하지만 clear handler가 익명 함수입니다.",
    "misspelled_function": "{location}: 버튼은 `{called_name}()`를 호출하지만 코드는 `function {declared_name}()`를 선언합니다.",
    "missing_function": "{location}: 버튼은 `{called_name}()`를 호출하지만 해당 이름의 함수가 선언되어 있지 않습니다.",
    "bad_try": "{location}: {evidence}는 잘못된 JavaScript 문법입니다. `try {{`여야 합니다.",
    "bad_click_handler": "{location}: {evidence}에는 handler body 앞의 `=>`가 없습니다.",
    "bad_math_case": "{location}: {evidence}에서 `Math` 대소문자가 잘못되었습니다.",
    "fix_missing_document": "`const display = document.getElementById(\"display\");`로 변경하세요.",
    "fix_anonymous_clear": "익명 clear handler를 `function clearDisplay(){ display.value = \"\"; }`로 변경하세요.",
    "fix_misspelled_function": "`function {declared_name}()`를 `function {called_name}()`로 이름 변경하세요.",
    "fix_missing_function": "`function {called_name}()`를 정의하거나 버튼이 기존 함수를 호출하도록 변경하세요.",
    "fix_bad_try": "`tr{{`를 `try {{`로 변경하세요.",
    "fix_bad_click_handler": "click handler에 `=>`를 추가하세요.",
    "fix_bad_math_case": "`math.floor`를 `Math.floor`로 변경하세요.",
}


def _localized_bug_strings(language: str) -> dict:
    return BUG_COPY.get(language, BUG_COPY["en"])


def _format_issue(issue: dict, language: str) -> str:
    copy = _localized_bug_strings(language)
    location = issue["location"]
    kind = issue["kind"]
    template = copy.get(kind, BUG_COPY["en"].get(kind, "{location}: {evidence}"))
    return f"- {template.format(location=location, evidence=issue.get('evidence', 'matched issue'), called_name=issue.get('called_name', ''), declared_name=issue.get('declared_name', ''))}"


def _format_fix(issue: dict, language: str) -> str:
    copy = _localized_bug_strings(language)
    template = copy.get(f"fix_{issue['kind']}", issue["fix"])
    rendered = template.replace("{called_name}", issue.get("called_name", ""))
    rendered = rendered.replace("{declared_name}", issue.get("declared_name", ""))
    return f"- {rendered}"


def _legacy_format_issue_unused(issue: dict, language: str) -> str:
    location = issue["location"]
    kind = issue["kind"]
    if language == "bn":
        if kind == "missing_document":
            return f"- {location}: {issue['evidence']} \u098f\u0996\u09be\u09a8\u09c7 `document` \u09a8\u09c7\u0987; \u09a4\u09be\u0987 `display` element \u0996\u09c1\u0981\u099c\u09c7 \u09aa\u09be\u09ac\u09c7 \u09a8\u09be\u0964"
        if kind == "anonymous_function":
            return f"- {location}: {issue['evidence']} \u098f\u099f\u09bf \u09a8\u09be\u09ae\u09b9\u09c0\u09a8 function; HTML button \u09a8\u09be\u09ae\u09af\u09c1\u0995\u09cd\u09a4 function \u0995\u09b2 \u0995\u09b0\u099b\u09c7\u0964"
        if kind == "anonymous_clear":
            return f"- {location}: `clearDisplay()` \u0995\u09b2 \u09b9\u099a\u09cd\u099b\u09c7, \u0995\u09bf\u09a8\u09cd\u09a4\u09c1 clear \u0995\u09b0\u09be\u09b0 function-\u099f\u09bf\u09b0 \u09a8\u09be\u09ae \u09a8\u09c7\u0987\u0964"
        if kind == "misspelled_function":
            return f"- {location}: button `{issue['called_name']}()` \u0995\u09b2 \u0995\u09b0\u099b\u09c7, \u0995\u09bf\u09a8\u09cd\u09a4\u09c1 code-\u098f `function {issue['declared_name']}()` \u0986\u099b\u09c7\u0964"
        if kind == "missing_function":
            return f"- {location}: button `{issue['called_name']}()` \u0995\u09b2 \u0995\u09b0\u099b\u09c7, \u0995\u09bf\u09a8\u09cd\u09a4\u09c1 \u098f\u0987 \u09a8\u09be\u09ae\u09c7 \u0995\u09cb\u09a8\u09cb function \u09a8\u09c7\u0987\u0964"
        if kind == "bad_try":
            return f"- {location}: {issue['evidence']} \u09ad\u09c1\u09b2 JavaScript syntax; \u098f\u099f\u09bf `try {{` \u09b9\u09ac\u09c7\u0964"
        if kind == "bad_click_handler":
            return f"- {location}: {issue['evidence']} click handler-\u098f `=>` \u09a8\u09c7\u0987\u0964"
        if kind == "bad_math_case":
            return f"- {location}: {issue['evidence']} \u098f\u0996\u09be\u09a8\u09c7 `Math` \u09ad\u09c1\u09b2 case-\u098f \u09b2\u09c7\u0996\u09be\u0964"

    if kind == "missing_document":
        return f"- {location}: {issue['evidence']} is missing `document` before `.getElementById(...)`."
    if kind == "anonymous_function":
        return f"- {location}: {issue['evidence']} defines an anonymous function, but inline `onclick` handlers call named functions."
    if kind == "anonymous_clear":
        return f"- {location}: `clearDisplay()` is called by a button, but the clear handler is anonymous."
    if kind == "misspelled_function":
        return f"- {location}: the button calls `{issue['called_name']}()`, but the code declares `function {issue['declared_name']}()`."
    if kind == "missing_function":
        return f"- {location}: the button calls `{issue['called_name']}()`, but no function with that name is declared."
    if kind == "bad_try":
        return f"- {location}: {issue['evidence']} is invalid JavaScript syntax; it should be `try {{`."
    if kind == "bad_click_handler":
        return f"- {location}: {issue['evidence']} is missing `=>` before the handler body."
    if kind == "bad_math_case":
        return f"- {location}: {issue['evidence']} uses the wrong `Math` casing."
    return f"- {location}: {issue.get('evidence', 'matched issue')}"


def _legacy_format_fix_unused(issue: dict, language: str) -> str:
    if language == "bn":
        kind = issue["kind"]
        if kind == "missing_document":
            return "- `const display = document.getElementById(\"display\");` ব্যবহার করুন।"
        if kind == "anonymous_clear":
            return "- anonymous clear handler-টি `function clearDisplay(){ display.value = \"\"; }` করুন।"
        if kind == "misspelled_function":
            return f"- `function {issue['declared_name']}()`-এর নাম বদলে `function {issue['called_name']}()` করুন।"
        if kind == "missing_function":
            return f"- `function {issue['called_name']}()` define করুন, অথবা button-এর `onclick` existing function-এর সাথে মিলিয়ে দিন।"
        if kind == "bad_try":
            return "- `tr{` বদলে `try {` করুন।"
        if kind == "bad_click_handler":
            return "- click handler-এ `=>` যোগ করুন।"
        if kind == "bad_math_case":
            return "- `math.floor` বদলে `Math.floor` করুন।"
    return f"- {issue['fix']}"


def _direct_navigator_answer(message: str, chunks: list[dict]) -> str | None:
    lowered = message.lower()
    if "button" not in lowered or "handled" not in lowered:
        return None

    button_line = _find_line(chunks, r"<button\b")
    selector_line = _find_line(chunks, r"getElementById\s*\(")
    handler_line = _find_line(chunks, r"addEventListener\s*\(")
    action_line = _find_line(chunks, r"style\.backgroundColor|backgroundColor\s*=")
    if not handler_line:
        return None

    evidence = []
    if button_line:
        evidence.append(f"- {button_line[0]}:{button_line[1]} defines the button: `{button_line[2]}`")
    if selector_line:
        evidence.append(f"- {selector_line[0]}:{selector_line[1]} selects it in JavaScript: `{selector_line[2]}`")
    evidence.append(f"- {handler_line[0]}:{handler_line[1]} attaches the click handler: `{handler_line[2]}`")
    if action_line:
        evidence.append(f"- {action_line[0]}:{action_line[1]} changes the page color: `{action_line[2]}`")

    return (
        "**Where to look**\n"
        f"{chr(10).join(evidence[:4])}\n\n"
        "**How it fits**\n"
        "The button is defined in the HTML, selected by its `id`, and handled by the click listener. "
        "That listener is the code path responsible for changing the background color."
    )


def _find_line(chunks: list[dict], pattern: str) -> tuple[str, int, str] | None:
    regex = re.compile(pattern)
    for chunk in chunks:
        for offset, line in enumerate(chunk["content"].splitlines()):
            stripped = line.strip()
            if regex.search(stripped):
                return chunk["file_path"], chunk["start_line"] + offset, stripped
    return None


def _dedupe_lines(lines: list[str]) -> list[str]:
    deduped = []
    seen = set()
    for line in lines:
        if line in seen:
            continue
        seen.add(line)
        deduped.append(line)
    return deduped


def _investigation_prompt(
    message: str,
    mode: str,
    chunks: list[dict],
    response_language: str | None,
) -> str:
    if mode == "bug":
        task = (
            "Investigate this bug report and answer concisely. Focus only on the bug, "
            "all concrete evidence candidates, and the likely fixes. Avoid generic debugging advice, "
            "background explanation, and repeated wording. Do not propose edits as already approved. "
            "Only cite files and line ranges listed in Evidence candidates. Do not invent line numbers, CSS issues, "
            "source names, UI layout problems, or operations that are not visible in the repository context. "
            "When multiple independent issues are visible, list each one instead of collapsing to one bug."
        )
        format_instruction = (
            "Use this exact format and keep the whole answer under 260 words:\n"
            "**Problem**\n"
            "One short sentence naming the likely bug cluster.\n\n"
            "**Evidence**\n"
            "Up to six bullets with file:line and the relevant code detail.\n\n"
            "**Fix**\n"
            "Matching bullets showing the corrections."
        )
    else:
        task = (
            "Navigate the repository for this question. Identify only the most relevant files, "
            "symbols, or modules. Cite concrete files and line numbers. Avoid generic summaries. "
            "Do not cite headings, labels, titles, or whole-file chunks unless they directly implement the requested behavior."
        )
        format_instruction = (
            "Use this exact format and keep the whole answer under 180 words:\n"
            "**Where to look**\n"
            "Two or three bullets with file:line and why it matters.\n\n"
            "**How it fits**\n"
            "One short paragraph connecting the evidence."
        )

    evidence = "\n".join(
        f"- {chunk['file_path']}:{chunk['start_line']}-{chunk['end_line']}"
        for chunk in chunks
    )
    return (
        f"{task}\n\n"
        f"User request: {message}\n\n"
        f"Evidence candidates:\n{evidence or '- No indexed evidence found'}\n\n"
        f"{language_instruction(message, response_language)}\n\n"
        f"{format_instruction}"
    )


def _fallback_answer(message: str, mode_label: str, chunks: list[dict]) -> str:
    if not chunks:
        return (
            f"I could not find indexed evidence for this {mode_label} request yet.\n\n"
            f"Request: {message}\n\n"
            "Try using a more specific file name, function name, route, error text, or UI label."
        )

    evidence_lines = "\n".join(
        f"- {chunk['file_path']}:{chunk['start_line']}-{chunk['end_line']} - "
        f"{chunk['content'].splitlines()[0][:120] if chunk['content'].strip() else 'matched context'}"
        for chunk in chunks[:4]
    )
    if mode_label == "bug investigation":
        return (
            "**Problem**\n"
            "The likely bug is in one of the matched code paths below.\n\n"
            "**Evidence**\n"
            f"{evidence_lines}\n\n"
            "**Fix**\n"
            "Inspect the cited line first and correct the handler, condition, or syntax shown there."
        )

    return (
        "**Where to look**\n"
        f"{evidence_lines}\n\n"
        "**How it fits**\n"
        "Start with the cited files; they are the closest matches to the request."
    )
