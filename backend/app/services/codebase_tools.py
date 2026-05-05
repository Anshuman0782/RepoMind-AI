from pathlib import Path

from git import Repo

from app.services.file_scanner import IGNORED_DIRS, IGNORED_FILES, iter_code_files
from app.services.repo_service import get_project_path


MAX_FILE_BYTES = 300_000
MAX_SEARCH_RESULTS = 100


def _relative_path(path: Path, root: Path) -> str:
    return str(path.resolve().relative_to(root.resolve())).replace("\\", "/")


def _resolve_repo_file(root: Path, requested_path: str) -> Path:
    if not requested_path.strip():
        raise ValueError("File path is required")

    file_path = root.joinpath(requested_path).resolve()
    repo_root = root.resolve()
    if file_path != repo_root and repo_root not in file_path.parents:
        raise ValueError("File path is outside the project")
    if any(part in IGNORED_DIRS for part in file_path.relative_to(repo_root).parts):
        raise ValueError("File path is ignored")
    if file_path.name in IGNORED_FILES:
        raise ValueError("File path is ignored")
    if not file_path.exists() or not file_path.is_file():
        raise FileNotFoundError("File not found")
    return file_path


async def list_files(project_id: str) -> list[dict]:
    root = (await get_project_path(project_id)).resolve()
    files = []
    for path in iter_code_files(root):
        stat = path.stat()
        files.append(
            {
                "path": _relative_path(path, root),
                "name": path.name,
                "size": stat.st_size,
                "modified_at": stat.st_mtime,
            }
        )
    return sorted(files, key=lambda item: item["path"].lower())


async def read_file(project_id: str, file_path: str) -> dict:
    root = (await get_project_path(project_id)).resolve()
    path = _resolve_repo_file(root, file_path)
    size = path.stat().st_size
    if size > MAX_FILE_BYTES:
        raise ValueError("File is too large to preview")

    content = path.read_text(encoding="utf-8", errors="ignore")
    return {
        "path": _relative_path(path, root),
        "content": content,
        "size": size,
        "line_count": len(content.splitlines()),
    }


async def search_code(project_id: str, query: str, limit: int = MAX_SEARCH_RESULTS) -> list[dict]:
    term = query.strip()
    if not term:
        return []

    root = (await get_project_path(project_id)).resolve()
    results = []
    normalized_limit = max(1, min(limit, MAX_SEARCH_RESULTS))
    term_lower = term.lower()

    for path in iter_code_files(root):
        if len(results) >= normalized_limit:
            break
        try:
            lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()
        except OSError:
            continue

        for line_number, line in enumerate(lines, start=1):
            if term_lower in line.lower():
                results.append(
                    {
                        "file_path": _relative_path(path, root),
                        "line_number": line_number,
                        "line": line.strip(),
                    }
                )
                if len(results) >= normalized_limit:
                    break

    return results


async def get_git_diff(project_id: str) -> dict:
    root = (await get_project_path(project_id)).resolve()
    try:
        repo = Repo(root)
        diff = repo.git.diff("--", ".")
    except Exception as exc:
        raise ValueError("Unable to read git diff") from exc

    return {"diff": diff}
