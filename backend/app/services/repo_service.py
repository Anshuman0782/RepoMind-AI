from pathlib import Path
from uuid import uuid4
import asyncio

from git import Repo

from app.core.config import settings
from app.core.database import db
from app.services.file_scanner import chunk_file, iter_code_files
from app.services.vector_store import delete_collection, upsert_chunks


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
    try:
        await asyncio.to_thread(Repo.clone_from, project["repo_url"], project_dir)
        await db.projects.update_one(
            {"_id": project_id},
            {"$set": {"status": "indexing"}},
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
                }
            },
        )
    except Exception:
        await db.projects.update_one(
            {"_id": project_id},
            {"$set": {"status": "import_failed"}},
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
        {"$set": {"status": "indexing"}},
    )

    try:
        chunks = await asyncio.to_thread(_build_chunks, project_dir)

        await delete_collection(project_id)
        await upsert_chunks(project_id, chunks)

        updates = {
            "status": "indexed",
            "file_count": len({chunk["file_path"] for chunk in chunks}),
            "chunk_count": len(chunks),
        }
        await db.projects.update_one({"_id": project_id}, {"$set": updates})
        return {**project, **updates}
    except Exception:
        await db.projects.update_one(
            {"_id": project_id},
            {"$set": {"status": "index_failed"}},
        )
        raise


async def get_project_path(project_id: str) -> Path:
    project = await db.projects.find_one({"_id": project_id})
    if not project:
        raise ValueError("Project not found")
    return Path(project["local_path"])
