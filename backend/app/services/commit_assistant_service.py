import re
from difflib import unified_diff
from pathlib import Path

from git import Repo
from git.exc import GitCommandError

from app.services.file_scanner import IGNORED_DIRS, IGNORED_FILES, is_text_file_path
from app.services.llm_provider import LLMProviderError, generate_answer
from app.services.repo_service import ensure_project_write_access, get_project_path


MAX_DIFF_CHARS = 20_000
MAX_UNTRACKED_FILES = 12


async def prepare_commit(project_id: str, context: str | None = None) -> dict:
    root = (await get_project_path(project_id)).resolve()
    repo = _repo(root)
    diff = _full_diff(root, repo)
    changed_files = _changed_files(repo, diff)

    if not diff.strip():
        return {
            "has_changes": False,
            "changed_files": [],
            "commit_message": "",
            "pr_title": "",
            "pr_description": "",
            "diff": "",
        }

    try:
        answer = await generate_answer(_prompt(diff[:MAX_DIFF_CHARS], changed_files, context), [])
        suggestion = _parse_suggestion(answer)
    except LLMProviderError:
        suggestion = _fallback_suggestion(changed_files)

    return {
        "has_changes": True,
        "changed_files": changed_files,
        "commit_message": suggestion["commit_message"],
        "pr_title": suggestion["pr_title"],
        "pr_description": suggestion["pr_description"],
        "diff": diff,
    }


async def create_commit(project_id: str, commit_message: str) -> dict:
    project = await ensure_project_write_access(project_id)
    root = (await get_project_path(project_id)).resolve()
    repo = _repo(root)
    diff = _full_diff(root, repo)
    changed_files = _changed_files(repo, diff)
    if not diff.strip():
        commit = repo.head.commit
        push_result = _push_commit(repo, project)
        return {
            "commit_hash": commit.hexsha,
            "commit_message": commit.message.strip(),
            "changed_files": [],
            "branch": push_result["branch"],
            "remote": push_result["remote"],
            "pushed": push_result["pushed"],
            "push_summary": push_result["push_summary"],
        }

    repo.git.add("-A")
    commit = repo.index.commit(commit_message.strip())
    push_result = _push_commit(repo, project)
    return {
        "commit_hash": commit.hexsha,
        "commit_message": commit.message.strip(),
        "changed_files": changed_files,
        "branch": push_result["branch"],
        "remote": push_result["remote"],
        "pushed": push_result["pushed"],
        "push_summary": push_result["push_summary"],
    }


def _push_commit(repo: Repo, project: dict) -> dict:
    try:
        branch = repo.active_branch.name
    except TypeError as exc:
        raise ValueError("Cannot push from a detached HEAD. Check out a branch first.") from exc

    if "origin" not in [remote.name for remote in repo.remotes]:
        raise ValueError("Cannot push commit because this repository has no origin remote.")

    remote = repo.remote("origin")
    original_url = remote.url
    push_url = _authenticated_remote_url(original_url, project)
    try:
        if push_url != original_url:
            remote.set_url(push_url)
        results = remote.push(refspec=f"{branch}:{branch}")
    except GitCommandError as exc:
        details = _sanitize_git_error(exc.stderr or exc.stdout or str(exc), project)
        raise ValueError(f"Commit was created, but GitHub push failed: {details}") from exc
    finally:
        if push_url != original_url:
            remote.set_url(original_url)

    summaries = [result.summary.strip() for result in results if result.summary]
    errors = [
        result.summary.strip()
        for result in results
        if result.flags & (result.ERROR | result.REJECTED | result.REMOTE_REJECTED)
    ]
    if errors:
        raise ValueError(f"Commit was created, but GitHub push failed: {'; '.join(errors)}")

    return {
        "branch": branch,
        "remote": "origin",
        "pushed": True,
        "push_summary": "; ".join(summaries) or f"Pushed to origin/{branch}",
    }


def _authenticated_remote_url(remote_url: str, project: dict) -> str:
    token = project.get("github_access_token")
    if not token:
        raise ValueError("GitHub write access is missing. Connect GitHub again before pushing.")

    if remote_url.startswith("https://github.com/"):
        return remote_url.replace("https://github.com/", f"https://x-access-token:{token}@github.com/", 1)

    owner = project.get("github_owner")
    repo = project.get("github_repo")
    if remote_url.startswith("git@github.com:") and owner and repo:
        return f"https://x-access-token:{token}@github.com/{owner}/{repo}.git"

    return remote_url


def _sanitize_git_error(details: str, project: dict) -> str:
    cleaned = (details or "Unknown git push error").strip()
    token = project.get("github_access_token")
    if token:
        cleaned = cleaned.replace(token, "[redacted]")
    cleaned = re.sub(r"https://x-access-token:[^@\s]+@", "https://[redacted]@", cleaned)
    return cleaned


def _repo(root: Path) -> Repo:
    try:
        return Repo(root)
    except Exception as exc:
        raise ValueError("Project path is not a git repository") from exc


def _full_diff(root: Path, repo: Repo) -> str:
    try:
        tracked_diff = repo.git.diff("--", ".")
        staged_diff = repo.git.diff("--cached", "--", ".")
        untracked_diff = _untracked_file_diff(root, repo)
        return "\n".join(
            part for part in [tracked_diff, staged_diff, untracked_diff] if part.strip()
        )
    except Exception as exc:
        raise ValueError("Unable to read git diff") from exc


def _untracked_file_diff(root: Path, repo: Repo) -> str:
    diffs = []
    for path in repo.untracked_files:
        if len(diffs) >= MAX_UNTRACKED_FILES:
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
        and is_text_file_path(file_path)
    )


def _changed_files(repo: Repo, diff: str) -> list[str]:
    files = []
    for item in repo.index.diff(None):
        path = (item.b_path or item.a_path or "").replace("\\", "/")
        if path and path not in files:
            files.append(path)
    for item in repo.index.diff("HEAD"):
        path = (item.b_path or item.a_path or "").replace("\\", "/")
        if path and path not in files:
            files.append(path)
    for path in repo.untracked_files:
        normalized = path.replace("\\", "/")
        if normalized not in files:
            files.append(normalized)
    for match in re.finditer(r"^\+\+\+ b/(.+)$", diff, flags=re.MULTILINE):
        path = match.group(1).strip()
        if path != "/dev/null" and path not in files:
            files.append(path)
    return files


def _prompt(diff: str, changed_files: list[str], context: str | None) -> str:
    files = "\n".join(f"- {path}" for path in changed_files)
    return (
        "You are a commit and pull request assistant. Read the diff and produce concise, "
        "professional finishing copy. Do not say tests were run unless the diff proves it. "
        "Return exactly these labels:\n"
        "COMMIT_MESSAGE:\n"
        "PR_TITLE:\n"
        "PR_DESCRIPTION:\n\n"
        "Do not wrap the commit message or PR title in quotes, markdown, or bold text. "
        "Use plain text for those two fields. "
        "Use a conventional commit style message when it fits, with a short subject and optional body. "
        "The PR description should include Summary, Testing, and Risks sections.\n\n"
        f"User context: {context or 'No extra context provided.'}\n\n"
        f"Changed files:\n{files}\n\n"
        f"Diff:\n```diff\n{diff}\n```"
    )


def _parse_suggestion(answer: str) -> dict:
    values = _extract_top_level_fields(answer)
    values["commit_message"] = _clean_single_line(values.get("commit_message", ""))
    values["pr_title"] = _clean_single_line(values.get("pr_title", ""))
    values["pr_description"] = _clean_pr_description(values.get("pr_description", ""))

    if not values["commit_message"] or not values["pr_title"] or not values["pr_description"]:
        raise LLMProviderError("Commit assistant response was incomplete")
    return values


def _extract_top_level_fields(answer: str) -> dict:
    label_pattern = re.compile(
        r"\*{0,2}\s*(COMMIT[_ ]MESSAGE|PR[_ ]TITLE|PR[_ ]DESCRIPTION)\s*\*{0,2}\s*:\s*\*{0,2}",
        flags=re.IGNORECASE,
    )
    matches = list(label_pattern.finditer(answer))
    values = {"commit_message": "", "pr_title": "", "pr_description": ""}

    for index, match in enumerate(matches):
        key = match.group(1).lower().replace(" ", "_")
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(answer)
        values[key] = answer[start:end].strip()

    return values


def _clean_single_line(value: str) -> str:
    lines = [line.strip() for line in value.splitlines() if line.strip()]
    text = lines[0] if lines else value.strip()
    text = re.sub(
        r"\*{0,2}\s*(COMMIT[_ ]MESSAGE|PR[_ ]TITLE|PR[_ ]DESCRIPTION)\s*\*{0,2}\s*:\s*\*{0,2}",
        "",
        text,
        flags=re.IGNORECASE,
    )
    text = text.strip().strip("*").strip()
    text = text.strip("\"'")
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _clean_pr_description(value: str) -> str:
    text = value.strip().strip("*").strip()
    text = re.sub(
        r"\*{0,2}\s*PR[_ ]DESCRIPTION\s*\*{0,2}\s*:\s*\*{0,2}",
        "",
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(r"\*{0,2}\s*(Summary|Testing|Risks)\s*\*{0,2}\s*:\s*", r"\n## \1\n", text)
    text = text.replace("**", "")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = "\n".join(line.strip() for line in text.splitlines()).strip()
    return text


def _fallback_suggestion(changed_files: list[str]) -> dict:
    scope = _fallback_scope(changed_files)
    files = "\n".join(f"- `{path}`" for path in changed_files[:12])
    return {
        "commit_message": f"chore: update {scope}",
        "pr_title": f"Update {scope}",
        "pr_description": (
            "## Summary\n"
            f"- Updates {scope} based on the current working tree changes.\n"
            f"- Changed files:\n{files or '- No changed files detected.'}\n\n"
            "## Testing\n"
            "- Not run by the commit assistant.\n\n"
            "## Risks\n"
            "- Review the diff and run the relevant project checks before opening a PR."
        ),
    }


def _fallback_scope(changed_files: list[str]) -> str:
    if not changed_files:
        return "project files"
    roots = {path.split("/", 1)[0] for path in changed_files}
    if len(roots) == 1:
        return next(iter(roots))
    return "project files"
