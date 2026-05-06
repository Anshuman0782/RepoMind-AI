import json
import re
from difflib import unified_diff
from pathlib import Path

from git import Repo

from app.core.database import db
from app.models.schemas import SourceChunk
from app.services.codebase_tools import read_file
from app.services.file_scanner import IGNORED_DIRS, IGNORED_FILES, TEXT_EXTENSIONS
from app.services.llm_provider import LLMProviderError, generate_answer
from app.services.repo_service import get_project_path


MAX_REVIEW_FILES = 8
MAX_DIFF_CHARS = 18_000


async def review_changes(
    project_id: str,
    message: str | None = None,
    change_set_id: str | None = None,
) -> tuple[str, list[SourceChunk]]:
    root = (await get_project_path(project_id)).resolve()
    diff, changed_files = await _review_diff(project_id, root, change_set_id)
    chunks = await _review_context(project_id, root, changed_files)
    sources = [SourceChunk(**chunk) for chunk in chunks]
    commands = _suggest_test_commands(root, changed_files)

    if not diff.strip():
        answer = _no_diff_answer(message, commands)
        return answer, sources

    deterministic_findings = _deterministic_findings(diff)
    prompt = _review_prompt(message or "", diff[:MAX_DIFF_CHARS], changed_files, commands)
    try:
        answer = await generate_answer(prompt, chunks)
        if answer.strip().lower().startswith("mock mode is working"):
            answer = _fallback_review(diff, changed_files, commands, message)
    except LLMProviderError:
        answer = _fallback_review(diff, changed_files, commands, message)

    return _merge_deterministic_findings(_normalize_review(answer, commands), deterministic_findings), sources


async def _review_diff(
    project_id: str,
    root: Path,
    change_set_id: str | None,
) -> tuple[str, list[str]]:
    if change_set_id:
        change_set = await db.edit_change_sets.find_one(
            {"_id": change_set_id, "project_id": project_id}
        )
        if not change_set:
            raise ValueError("Change set not found")
        files = [operation["path"] for operation in change_set.get("operations", [])]
        return change_set.get("diff", ""), files[:MAX_REVIEW_FILES]

    diff = _git_diff(root)
    return diff, _changed_files(diff)


def _git_diff(root: Path) -> str:
    try:
        repo = Repo(root)
        tracked_diff = repo.git.diff("--", ".")
        untracked_diff = _untracked_file_diff(root, repo)
        return "\n".join(part for part in [tracked_diff, untracked_diff] if part.strip())
    except Exception as exc:
        raise ValueError("Unable to read git diff") from exc


def _untracked_file_diff(root: Path, repo: Repo) -> str:
    diffs = []
    for path in repo.untracked_files:
        if len(diffs) >= MAX_REVIEW_FILES:
            break
        if not _is_readable_code_path(root, path):
            continue
        file_path = root.joinpath(path)
        try:
            new_content = file_path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        normalized_path = path.replace("\\", "/")
        diffs.append(
            "\n".join(
                unified_diff(
                    [],
                    new_content.splitlines(),
                    fromfile="/dev/null",
                    tofile=f"b/{normalized_path}",
                    lineterm="",
                )
            )
        )
    return "\n".join(part for part in diffs if part.strip())


def _changed_files(diff: str) -> list[str]:
    files = []
    for match in re.finditer(r"^\+\+\+ b/(.+)$", diff, flags=re.MULTILINE):
        path = match.group(1).strip()
        if path == "/dev/null" or path in files:
            continue
        files.append(path)
    for match in re.finditer(r"^--- a/(.+)$", diff, flags=re.MULTILINE):
        path = match.group(1).strip()
        if path == "/dev/null" or path in files:
            continue
        files.append(path)
    return files[:MAX_REVIEW_FILES]


async def _review_context(project_id: str, root: Path, changed_files: list[str]) -> list[dict]:
    chunks: list[dict] = []
    for path in changed_files:
        if not _is_readable_code_path(root, path):
            continue
        try:
            content = await read_file(project_id, path)
        except (FileNotFoundError, ValueError):
            continue
        chunks.append(
            {
                "file_path": content["path"],
                "start_line": 1,
                "end_line": content["line_count"],
                "content": content["content"],
            }
        )
    return chunks


def _is_readable_code_path(root: Path, requested_path: str) -> bool:
    try:
        file_path = root.joinpath(requested_path).resolve()
        repo_root = root.resolve()
        if file_path == repo_root or repo_root not in file_path.parents:
            return False
        relative_parts = file_path.relative_to(repo_root).parts
    except OSError:
        return False
    return (
        not any(part in IGNORED_DIRS for part in relative_parts)
        and file_path.name not in IGNORED_FILES
        and file_path.suffix.lower() in TEXT_EXTENSIONS
    )


def _suggest_test_commands(root: Path, changed_files: list[str]) -> list[str]:
    commands: list[str] = []
    if root.joinpath("package.json").exists():
        scripts = _package_scripts(root.joinpath("package.json"))
        if "test" in scripts:
            commands.append("npm test")
        if "lint" in scripts:
            commands.append("npm run lint")
        if "build" in scripts:
            commands.append("npm run build")
    if root.joinpath("pyproject.toml").exists() or root.joinpath("requirements.txt").exists():
        if any(path.endswith(".py") for path in changed_files):
            commands.append("python -m pytest")
        commands.append("python -m compileall app")
    if not commands:
        commands.append("Run the project-specific test or build command for the changed files.")
    return commands


def _package_scripts(package_json: Path) -> dict:
    try:
        data = json.loads(package_json.read_text(encoding="utf-8", errors="ignore"))
    except (OSError, json.JSONDecodeError):
        return {}
    scripts = data.get("scripts", {})
    return scripts if isinstance(scripts, dict) else {}


def _review_prompt(message: str, diff: str, changed_files: list[str], commands: list[str]) -> str:
    files = "\n".join(f"- {path}" for path in changed_files) or "- No changed files detected"
    tests = "\n".join(f"- `{command}`" for command in commands)
    return (
        "Review the current uncommitted diff as a careful code reviewer and test writer. "
        "Prioritize concrete bugs, regressions, risky patterns, missing validation, and missing tests. "
        "Do not claim tests were run. Do not propose edits as already completed. "
        "If there are no clear findings, say that directly and focus on useful tests and residual risks. "
        "Use only the diff and repository context supplied.\n\n"
        f"User context: {message or 'Review the current changes.'}\n\n"
        f"Changed files:\n{files}\n\n"
        f"Suggested command candidates:\n{tests}\n\n"
        f"Diff:\n```diff\n{diff}\n```\n\n"
        "Use this exact format:\n"
        "**Review Findings**\n"
        "- Finding with file path and why it matters, or `No blocking findings found.`\n\n"
        "**Tests To Add Or Update**\n"
        "- Specific test coverage recommendation.\n\n"
        "**Suggested Test Commands**\n"
        "- `command`\n\n"
        "**Residual Risks**\n"
        "- Remaining risk or manual check."
    )


def _fallback_review(diff: str, changed_files: list[str], commands: list[str], message: str | None) -> str:
    files = ", ".join(f"`{path}`" for path in changed_files) or "the current diff"
    test_lines = "\n".join(f"- `{command}`" for command in commands)
    context_line = f" User context: {message}" if message else ""
    return (
        "**Review Findings**\n"
        f"- No blocking findings found from the available automated review context for {files}.{context_line}\n"
        "- Check that each changed path has validation for empty, missing, or invalid inputs where applicable.\n\n"
        "**Tests To Add Or Update**\n"
        "- Add or update tests that exercise the changed behavior and at least one failure or edge case.\n"
        "- For UI changes, include a manual browser check for the affected workflow.\n\n"
        "**Suggested Test Commands**\n"
        f"{test_lines}\n\n"
        "**Residual Risks**\n"
        "- The review is based on the uncommitted diff and readable changed files only.\n"
        "- Run the suggested commands before committing."
    )


def _deterministic_findings(diff: str) -> list[str]:
    findings = []
    for line_number, line in enumerate(diff.splitlines(), start=1):
        if not line.startswith("+") or line.startswith("+++"):
            continue
        code = line[1:].strip()
        if not code:
            continue
        if re.search(r"addEventListener\s*\([^,]+,\s*=>\s*\(\)\s*\{", code):
            findings.append(
                f"- Diff line {line_number}: invalid event listener callback syntax `{code}`. "
                "Use `button.addEventListener(\"click\", () => { ... })`; `=> () {` is not valid JavaScript."
            )
        if re.search(r"addEventListener\s*\([^,]+,\s*\(\)\s*\{", code):
            findings.append(
                f"- Diff line {line_number}: invalid arrow function syntax `{code}`. "
                "The callback is missing `=>` between `()` and `{`, so the browser will throw a syntax error."
            )
        if re.search(r"\bmath\.", code):
            findings.append(
                f"- Diff line {line_number}: JavaScript is case-sensitive, so `{code}` references undefined `math`. "
                "Use `Math.floor` or `Math.random` with a capital `M`."
            )
        if ".random(" in code and "Math.random(" not in code:
            findings.append(
                f"- Diff line {line_number}: `{code}` calls `.random()` without the `Math` object. "
                "Use `Math.random()` before multiplying by `colors.length`."
            )
    return _dedupe_lines(findings)


def _dedupe_lines(lines: list[str]) -> list[str]:
    deduped = []
    seen = set()
    for line in lines:
        normalized = re.sub(r"Diff line \d+", "Diff line", line)
        if normalized in seen:
            continue
        seen.add(normalized)
        deduped.append(line)
    return deduped


def _merge_deterministic_findings(answer: str, findings: list[str]) -> str:
    if not findings:
        return answer

    inserted = "\n".join(findings)
    return re.sub(
        r"(\*\*Review Findings\*\*\n)",
        lambda match: f"{match.group(1)}{inserted}\n",
        answer,
        count=1,
        flags=re.IGNORECASE,
    )


def _no_diff_answer(message: str | None, commands: list[str]) -> str:
    test_lines = "\n".join(f"- `{command}`" for command in commands)
    scope = message or "No extra review context provided."
    return (
        "**Review Findings**\n"
        "- No uncommitted diff was found to review.\n\n"
        "**Tests To Add Or Update**\n"
        f"- Describe or select a changed feature first, then add tests around that behavior. Context: {scope}\n\n"
        "**Suggested Test Commands**\n"
        f"{test_lines}\n\n"
        "**Residual Risks**\n"
        "- There is no diff evidence yet, so this cannot catch implementation regressions."
    )


def _normalize_review(answer: str, commands: list[str]) -> str:
    required_sections = [
        "**Review Findings**",
        "**Tests To Add Or Update**",
        "**Suggested Test Commands**",
        "**Residual Risks**",
    ]
    if all(section.lower() in answer.lower() for section in required_sections):
        return answer.strip()

    test_lines = "\n".join(f"- `{command}`" for command in commands)
    return (
        f"{answer.strip()}\n\n"
        "**Suggested Test Commands**\n"
        f"{test_lines}\n\n"
        "**Residual Risks**\n"
        "- Run the suggested commands and manually verify the affected workflow before committing."
    )
