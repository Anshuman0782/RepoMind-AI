import shutil
from pathlib import Path

from fastapi import APIRouter, HTTPException

from app.core.config import settings
from app.core.database import db
from app.models.schemas import (
    CodeSearchResultResponse,
    CreateProjectRequest,
    FileContentResponse,
    FileEntryResponse,
    GitDiffResponse,
    ProjectResponse,
)
from app.services.codebase_tools import get_git_diff, list_files, read_file, search_code
from app.services.repo_service import create_project
from app.services.vector_store import index_path


router = APIRouter()


@router.post("", response_model=ProjectResponse)
async def create_project_endpoint(payload: CreateProjectRequest) -> ProjectResponse:
    try:
        project = await create_project(payload.name, str(payload.repo_url))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return ProjectResponse(
        id=project["_id"],
        name=project["name"],
        repo_url=project["repo_url"],
        status=project["status"],
    )


@router.get("", response_model=list[ProjectResponse])
async def list_projects() -> list[ProjectResponse]:
    projects = []
    async for project in db.projects.find({}).sort("_id", -1):
        projects.append(
            ProjectResponse(
                id=project["_id"],
                name=project["name"],
                repo_url=project["repo_url"],
                status=project["status"],
            )
        )
    return projects


@router.get("/{project_id}/files", response_model=list[FileEntryResponse])
async def list_project_files(project_id: str) -> list[FileEntryResponse]:
    try:
        return await list_files(project_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/{project_id}/files/content", response_model=FileContentResponse)
async def read_project_file(project_id: str, path: str) -> FileContentResponse:
    try:
        return await read_file(project_id, path)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/{project_id}/search", response_model=list[CodeSearchResultResponse])
async def search_project_code(
    project_id: str,
    query: str,
    limit: int = 100,
) -> list[CodeSearchResultResponse]:
    try:
        return await search_code(project_id, query, limit)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/{project_id}/git-diff", response_model=GitDiffResponse)
async def read_project_git_diff(project_id: str) -> GitDiffResponse:
    try:
        return await get_git_diff(project_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/{project_id}", status_code=204)
async def delete_project(project_id: str) -> None:
    project = await db.projects.find_one({"_id": project_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    await db.chat_messages.delete_many({"project_id": project_id})
    await db.chats.delete_many({"project_id": project_id})
    await db.projects.delete_one({"_id": project_id})

    vector_path = index_path(project_id)
    if vector_path.exists():
        try:
            vector_path.unlink()
        except OSError:
            pass

    local_path = project.get("local_path")
    if local_path:
        repo_path = settings.repos_dir.joinpath(project_id).resolve()
        repos_root = settings.repos_dir.resolve()
        stored_path = repo_path
        try:
            stored_path = repo_path if str(repo_path) == str(local_path) else Path(local_path).resolve()
        except OSError:
            stored_path = repo_path

        if stored_path == repos_root or repos_root not in stored_path.parents:
            return

        if stored_path.exists():
            shutil.rmtree(stored_path, ignore_errors=True)
