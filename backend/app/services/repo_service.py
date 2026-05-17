from pathlib import Path
from uuid import uuid4
import asyncio
from datetime import datetime, timezone

from git import Repo

from app.core.config import settings
from app.core.database import db
from app.services.file_scanner import chunk_file, iter_code_files
from app.services.vector_store import delete_collection, upsert_chunks


RUNNING_STATUSES = {"importing", "indexing"}


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


async def create_project(name: str, repo_url: str) -> dict:
    project_id = str(uuid4())
    project_dir = settings.repos_dir / project_id

    project = {
        "_id": project_id,
        "name": name,
        "repo_url": repo_url,
        "local_path": str(project_dir),
        "status": "importing",
        "file_count": 0,
        "chunk_count": 0,
        "created_at": utc_now(),
        "updated_at": utc_now(),
    }
    await db.projects.insert_one(project)
    return project


def _build_chunks(project_dir: Path) -> list[dict]:
    chunks = []
    for file_path in iter_code_files(project_dir):
        chunks.extend(chunk_file(file_path, project_dir))
    return chunks


async def import_project(project_id: str) -> None:
    project = await db.projects.find_one({"_id": project_id})
    if not project:
        return

    project_dir = Path(project["local_path"])
    failed_status = "import_failed"
    try:
        await asyncio.to_thread(Repo.clone_from, project["repo_url"], project_dir)
        failed_status = "index_failed"
        await db.projects.update_one(
            {"_id": project_id},
            {"$set": {"status": "indexing", "updated_at": utc_now()}},
        )

        chunks = await asyncio.to_thread(_build_chunks, project_dir)
        await upsert_chunks(project_id, chunks)

        await db.projects.update_one(
            {"_id": project_id},
            {
                "$set": {
                    "status": "indexed",
                    "file_count": len({chunk["file_path"] for chunk in chunks}),
                    "chunk_count": len(chunks),
                    "updated_at": utc_now(),
                }
            },
        )
    except Exception:
        await db.projects.update_one(
            {"_id": project_id},
            {"$set": {"status": failed_status, "updated_at": utc_now()}},
        )
        raise


async def reindex_project(project_id: str) -> dict:
    project = await db.projects.find_one({"_id": project_id})
    if not project:
        raise ValueError("Project not found")

    project_dir = Path(project["local_path"])
    if not project_dir.exists():
        raise ValueError("Project files are missing locally")

    await db.projects.update_one(
        {"_id": project_id},
        {"$set": {"status": "indexing", "updated_at": utc_now()}},
    )

    try:
        chunks = await asyncio.to_thread(_build_chunks, project_dir)

        await delete_collection(project_id)
        await upsert_chunks(project_id, chunks)

        updates = {
            "status": "indexed",
            "file_count": len({chunk["file_path"] for chunk in chunks}),
            "chunk_count": len(chunks),
            "updated_at": utc_now(),
        }
        await db.projects.update_one({"_id": project_id}, {"$set": updates})
        return {**project, **updates}
    except Exception:
        await db.projects.update_one(
            {"_id": project_id},
            {"$set": {"status": "index_failed", "updated_at": utc_now()}},
        )
        raise


async def get_project_path(project_id: str) -> Path:
    project = await db.projects.find_one({"_id": project_id})
    if not project:
        raise ValueError("Project not found")
    return Path(project["local_path"])


async def recover_interrupted_imports() -> None:
    now = utc_now()
    await db.projects.update_many(
        {"status": "importing"},
        {
            "$set": {
                "status": "import_interrupted",
                "updated_at": now,
            }
        },
    )
    await db.projects.update_many(
        {"status": "indexing"},
        {
            "$set": {
                "status": "index_interrupted",
                "updated_at": now,
            }
        },
    )


def project_status_error(project: dict) -> str | None:
    status = project.get("status")
    if status == "indexed":
        return None
    if status in RUNNING_STATUSES:
        return "This project is still importing/indexing. Wait until the status becomes indexed, then ask again."
    if status == "import_interrupted":
        return "The import was interrupted, likely by the development server reload. Re-index or import the repo again."
    if status == "index_interrupted":
        return "Indexing was interrupted, likely by the development server reload. Use the Index button to re-index this project."
    if status == "import_failed":
        return "Repo import failed. Check that the GitHub URL is public and valid, then import again."
    if status == "index_failed":
        return "Repo indexing failed. Use the Index button after fixing the indexing error."
    return f"Project is not ready for chat yet. Current status: {status or 'unknown'}."
