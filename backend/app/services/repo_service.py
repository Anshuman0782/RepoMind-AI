from pathlib import Path
from uuid import uuid4

from git import Repo

from app.core.config import settings
from app.core.database import db
from app.services.file_scanner import chunk_file, iter_code_files
from app.services.vector_store import upsert_chunks


async def create_project(name: str, repo_url: str) -> dict:
    project_id = str(uuid4())
    project_dir = settings.repos_dir / project_id

    Repo.clone_from(repo_url, project_dir)

    chunks = []
    for file_path in iter_code_files(project_dir):
        chunks.extend(chunk_file(file_path, project_dir))

    await upsert_chunks(project_id, chunks)

    project = {
        "_id": project_id,
        "name": name,
        "repo_url": repo_url,
        "local_path": str(project_dir),
        "status": "indexed",
        "file_count": len({chunk["file_path"] for chunk in chunks}),
        "chunk_count": len(chunks),
    }
    await db.projects.insert_one(project)
    return project


async def get_project_path(project_id: str) -> Path:
    project = await db.projects.find_one({"_id": project_id})
    if not project:
        raise ValueError("Project not found")
    return Path(project["local_path"])

