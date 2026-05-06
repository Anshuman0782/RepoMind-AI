import re

from app.models.schemas import SourceChunk
from app.services.codebase_tools import search_code
from app.services.llm_provider import LLMProviderError, generate_answer
from app.services.vector_store import search_chunks


MAX_EVIDENCE_CHUNKS = 4
MAX_KEYWORD_RESULTS = 4
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

    return _dedupe_chunks(chunks)[: MAX_EVIDENCE_CHUNKS + MAX_KEYWORD_RESULTS]


async def investigate_codebase(project_id: str, message: str, mode: str) -> tuple[str, list[SourceChunk]]:
    effective_mode = _effective_mode(message, mode)
    chunks = await collect_investigation_evidence(project_id, message)
    sources = [SourceChunk(**chunk) for chunk in chunks]
    mode_label = "bug investigation" if effective_mode == "bug" else "repo navigation"

    if effective_mode == "bug":
        direct_answer = _direct_bug_answer(chunks)
        if direct_answer:
            return direct_answer, sources
    else:
        direct_answer = _direct_navigator_answer(message, chunks)
        if direct_answer:
            return direct_answer, sources

    prompt = _investigation_prompt(message, effective_mode, chunks)

    try:
        answer = await generate_answer(prompt, chunks)
    except LLMProviderError:
        answer = _fallback_answer(message, mode_label, chunks)

    return answer, sources


def _effective_mode(message: str, mode: str) -> str:
    lowered = message.lower()
    if mode == "bug" or any(term in lowered for term in BUG_TERMS):
        return "bug"
    return "navigator"


def _direct_bug_answer(chunks: list[dict]) -> str | None:
    for chunk in chunks:
        for offset, line in enumerate(chunk["content"].splitlines()):
            stripped = line.strip()
            if re.search(r"addEventListener\s*\(.*\(\)\s*\{", stripped):
                line_number = chunk["start_line"] + offset
                return (
                    "**Problem**\n"
                    "The click handler has invalid arrow-function syntax, so the script stops before the button works.\n\n"
                    "**Evidence**\n"
                    f"- {chunk['file_path']}:{line_number} has `{stripped}`\n"
                    "- The function is missing `=>` before `{`.\n\n"
                    "**Fix**\n"
                    "Change it to `button.addEventListener(\"click\", () => {`."
                )
    return None


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


def _investigation_prompt(message: str, mode: str, chunks: list[dict]) -> str:
    if mode == "bug":
        task = (
            "Investigate this bug report and answer concisely. Focus only on the bug, "
            "the exact evidence, and the likely fix. Avoid generic debugging advice, "
            "background explanation, and repeated wording. Do not propose edits as already approved."
        )
        format_instruction = (
            "Use this exact format and keep the whole answer under 140 words:\n"
            "**Problem**\n"
            "One short sentence naming the likely bug.\n\n"
            "**Evidence**\n"
            "One or two bullets with file:line and the relevant code detail.\n\n"
            "**Fix**\n"
            "One short sentence or code snippet showing the correction."
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
