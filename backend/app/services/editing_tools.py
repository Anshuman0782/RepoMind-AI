from datetime import datetime, timezone
from difflib import unified_diff
from pathlib import Path
from uuid import uuid4

from app.core.database import db
from app.services.file_scanner import IGNORED_DIRS, IGNORED_FILES, is_text_file_path
from app.services.repo_service import ensure_project_write_access, get_project_path


MAX_EDIT_FILE_BYTES = 500_000
MAX_EDIT_CONTENT_BYTES = 500_000


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _relative_path(path: Path, root: Path) -> str:
    return str(path.resolve().relative_to(root.resolve())).replace("\\", "/")


def _resolve_edit_path(root: Path, requested_path: str) -> Path:
    cleaned_path = requested_path.strip().replace("\\", "/")
    if not cleaned_path:
        raise ValueError("File path is required")
    if cleaned_path.startswith("/") or cleaned_path.startswith("../") or "/../" in cleaned_path:
        raise ValueError("File path must stay inside the project")

    file_path = root.joinpath(cleaned_path).resolve()
    repo_root = root.resolve()
    if file_path == repo_root or repo_root not in file_path.parents:
        raise ValueError("File path is outside the project")

    relative_parts = file_path.relative_to(repo_root).parts
    if any(part in IGNORED_DIRS for part in relative_parts):
        raise ValueError("File path is ignored")
    if file_path.name in IGNORED_FILES:
        raise ValueError("File path is ignored")
    if not is_text_file_path(file_path):
        raise ValueError("Only text code files can be edited")

    return file_path


def _read_text(path: Path) -> str:
    size = path.stat().st_size
    if size > MAX_EDIT_FILE_BYTES:
        raise ValueError("File is too large to edit safely")
    return path.read_text(encoding="utf-8", errors="ignore")


def _content_for_action(action: str, content: str | None) -> str:
    if action == "delete":
        return ""
    if content is None:
        raise ValueError("File content is required for create and edit operations")
    if len(content.encode("utf-8")) > MAX_EDIT_CONTENT_BYTES:
        raise ValueError("Proposed content is too large to edit safely")
    return content


def _operation_diff(relative_path: str, old_content: str, new_content: str) -> str:
    return "\n".join(
        unified_diff(
            old_content.splitlines(),
            new_content.splitlines(),
            fromfile=f"a/{relative_path}",
            tofile=f"b/{relative_path}",
            lineterm="",
        )
    )


async def create_edit_change_set(project_id: str, operations: list[dict], user: dict | None = None) -> dict:
    await ensure_project_write_access(project_id, user)
    root = (await get_project_path(project_id)).resolve()
    prepared_operations = []
    diffs = []
    seen_paths = set()

    for operation in operations:
        action = operation["action"]
        path = _resolve_edit_path(root, operation["path"])
        relative_path = _relative_path(path, root)
        if relative_path in seen_paths:
            raise ValueError(f"Duplicate operation for {relative_path}")
        seen_paths.add(relative_path)

        exists = path.exists()
        if action == "create" and exists:
            raise ValueError(f"{relative_path} already exists")
        if action in {"edit", "delete"} and (not exists or not path.is_file()):
            raise FileNotFoundError(f"{relative_path} was not found")

        old_content = _read_text(path) if exists else ""
        new_content = _content_for_action(action, operation.get("content"))
        diff = _operation_diff(relative_path, old_content, new_content)
        if action == "edit" and old_content == new_content:
            raise ValueError(f"{relative_path} has no proposed changes")

        prepared_operations.append(
            {
                "action": action,
                "path": relative_path,
                "old_content": old_content,
                "new_content": new_content,
            }
        )
        diffs.append(diff)

    change_set = {
        "_id": str(uuid4()),
        "project_id": project_id,
        "status": "pending",
        "operations": prepared_operations,
        "diff": "\n".join(part for part in diffs if part).strip(),
        "created_at": _now(),
        "updated_at": _now(),
    }
    await db.edit_change_sets.insert_one(change_set)
    return _serialize_change_set(change_set)


async def apply_edit_change_set(project_id: str, change_set_id: str, user: dict | None = None) -> dict:
    await ensure_project_write_access(project_id, user)
    change_set = await _get_change_set(project_id, change_set_id)
    if change_set["status"] != "pending":
        raise ValueError("Only pending change sets can be applied")

    root = (await get_project_path(project_id)).resolve()
    for operation in change_set["operations"]:
        path = _resolve_edit_path(root, operation["path"])
        current_exists = path.exists()
        if operation["action"] == "create":
            if current_exists:
                raise ValueError(f"{operation['path']} already exists")
            continue
        if not current_exists or not path.is_file():
            raise ValueError(f"{operation['path']} changed since preview")
        if _read_text(path) != operation["old_content"]:
            raise ValueError(f"{operation['path']} changed since preview")

    for operation in change_set["operations"]:
        path = _resolve_edit_path(root, operation["path"])
        if operation["action"] == "delete":
            path.unlink()
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(operation["new_content"], encoding="utf-8")

    await db.edit_change_sets.update_one(
        {"_id": change_set_id, "project_id": project_id},
        {"$set": {"status": "applied", "updated_at": _now()}},
    )
    return await _get_change_set(project_id, change_set_id, serialize=True)


async def reject_edit_change_set(project_id: str, change_set_id: str) -> dict:
    change_set = await _get_change_set(project_id, change_set_id)
    if change_set["status"] != "pending":
        raise ValueError("Only pending change sets can be rejected")

    await db.edit_change_sets.update_one(
        {"_id": change_set_id, "project_id": project_id},
        {"$set": {"status": "rejected", "updated_at": _now()}},
    )
    return await _get_change_set(project_id, change_set_id, serialize=True)


async def rollback_edit_change_set(project_id: str, change_set_id: str, user: dict | None = None) -> dict:
    await ensure_project_write_access(project_id, user)
    change_set = await _get_change_set(project_id, change_set_id)
    if change_set["status"] != "applied":
        raise ValueError("Only applied change sets can be rolled back")

    root = (await get_project_path(project_id)).resolve()
    for operation in change_set["operations"]:
        path = _resolve_edit_path(root, operation["path"])
        if operation["action"] in {"create", "edit"}:
            if not path.exists() or not path.is_file():
                raise ValueError(f"{operation['path']} changed after apply")
            if _read_text(path) != operation["new_content"]:
                raise ValueError(f"{operation['path']} changed after apply")
        elif path.exists():
            raise ValueError(f"{operation['path']} changed after apply")

    for operation in reversed(change_set["operations"]):
        path = _resolve_edit_path(root, operation["path"])
        if operation["action"] == "create":
            path.unlink()
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(operation["old_content"], encoding="utf-8")

    await db.edit_change_sets.update_one(
        {"_id": change_set_id, "project_id": project_id},
        {"$set": {"status": "rolled_back", "updated_at": _now()}},
    )
    return await _get_change_set(project_id, change_set_id, serialize=True)


async def _get_change_set(project_id: str, change_set_id: str, serialize: bool = False) -> dict:
    change_set = await db.edit_change_sets.find_one({"_id": change_set_id, "project_id": project_id})
    if not change_set:
        raise FileNotFoundError("Change set not found")
    return _serialize_change_set(change_set) if serialize else change_set


def _serialize_change_set(change_set: dict) -> dict:
    return {
        "id": change_set["_id"],
        "project_id": change_set["project_id"],
        "status": change_set["status"],
        "files": [operation["path"] for operation in change_set["operations"]],
        "diff": change_set["diff"],
    }
