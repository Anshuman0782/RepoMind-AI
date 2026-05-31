import shutil
from pathlib import Path
from urllib.parse import urlencode
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Body, HTTPException
from fastapi.responses import RedirectResponse
import httpx

from app.core.config import settings
from app.core.database import db
from app.models.schemas import (
    CodeSearchResultResponse,
    CommitAssistantRequest,
    CommitAssistantResponse,
    CreateCommitRequest,
    CreateCommitResponse,
    CreateEditChangeSetRequest,
    CreateProjectRequest,
    EditChangeSetResponse,
    FileContentResponse,
    FileEntryResponse,
    GitHubAuthStartResponse,
    GitDiffResponse,
    ProjectResponse,
)
from app.services.codebase_tools import get_git_diff, list_files, read_file, search_code
from app.services.commit_assistant_service import create_commit, prepare_commit
from app.services.editing_tools import (
    apply_edit_change_set,
    create_edit_change_set,
    reject_edit_change_set,
    rollback_edit_change_set,
)
from app.services.repo_service import create_project, import_project, reindex_project, utc_now
from app.services.vector_store import delete_collection


router = APIRouter()

GITHUB_WRITE_PERMISSIONS = {"admin", "maintain", "write"}


def to_project_response(project: dict) -> ProjectResponse:
    return ProjectResponse(
        id=project["_id"],
        name=project["name"],
        repo_url=project["repo_url"],
        status=project["status"],
        access_mode=project.get("access_mode", "read_only"),
        auth_provider=project.get("auth_provider"),
        github_owner=project.get("github_owner"),
        github_repo=project.get("github_repo"),
        github_user_login=project.get("github_user_login"),
        github_permissions=project.get("github_permissions") or {"pull": True, "push": False},
    )


def _github_callback_url() -> str:
    return f"{str(settings.public_backend_url).rstrip('/')}/api/projects/github-auth/callback"


def _github_auth_redirect(project_id: str, status: str, message: str = "") -> RedirectResponse:
    params = {"github_auth": status, "project_id": project_id}
    if message:
        params["message"] = message
    return RedirectResponse(f"{str(settings.frontend_url).rstrip('/')}?{urlencode(params)}")


@router.post("", response_model=ProjectResponse)
async def create_project_endpoint(
    payload: CreateProjectRequest,
    background_tasks: BackgroundTasks,
) -> ProjectResponse:
    try:
        project = await create_project(payload.name, str(payload.repo_url))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    background_tasks.add_task(import_project, project["_id"])

    return to_project_response(project)


@router.get("", response_model=list[ProjectResponse])
async def list_projects() -> list[ProjectResponse]:
    projects = []
    async for project in db.projects.find({}).sort("_id", -1):
        projects.append(to_project_response(project))
    return projects


@router.post("/{project_id}/github-auth/start", response_model=GitHubAuthStartResponse)
async def start_github_project_auth(project_id: str) -> GitHubAuthStartResponse:
    project = await db.projects.find_one({"_id": project_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not settings.github_client_id or not settings.github_client_secret:
        raise HTTPException(
            status_code=400,
            detail=(
                "GitHub login is not configured yet. Add GITHUB_CLIENT_ID and "
                "GITHUB_CLIENT_SECRET to backend/.env, then restart the backend."
            ),
        )

    state = str(uuid4())
    await db.github_auth_states.insert_one(
        {
            "_id": state,
            "project_id": project_id,
            "created_at": utc_now(),
        }
    )
    params = urlencode(
        {
            "client_id": settings.github_client_id,
            "redirect_uri": _github_callback_url(),
            "scope": "repo",
            "state": state,
        }
    )
    return GitHubAuthStartResponse(
        auth_url=f"https://github.com/login/oauth/authorize?{params}",
        state=state,
    )


@router.get("/github-auth/callback")
async def github_project_auth_callback(code: str, state: str) -> RedirectResponse:
    state_doc = await db.github_auth_states.find_one({"_id": state})
    if not state_doc:
        return _github_auth_redirect("", "error", "GitHub permission session expired.")

    project_id = state_doc["project_id"]
    await db.github_auth_states.delete_one({"_id": state})
    project = await db.projects.find_one({"_id": project_id})
    if not project:
        return _github_auth_redirect(project_id, "error", "Project not found.")
    if not project.get("github_owner") or not project.get("github_repo"):
        return _github_auth_redirect(project_id, "error", "This project is not a GitHub repo.")

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            token_response = await client.post(
                "https://github.com/login/oauth/access_token",
                headers={"Accept": "application/json"},
                data={
                    "client_id": settings.github_client_id,
                    "client_secret": settings.github_client_secret,
                    "code": code,
                    "redirect_uri": _github_callback_url(),
                },
            )
            token_response.raise_for_status()
            token_payload = token_response.json()
            access_token = token_payload.get("access_token")
            if not access_token:
                return _github_auth_redirect(project_id, "error", "GitHub did not return an access token.")

            headers = {
                "Accept": "application/vnd.github+json",
                "Authorization": f"Bearer {access_token}",
                "X-GitHub-Api-Version": "2022-11-28",
            }
            user_response = await client.get("https://api.github.com/user", headers=headers)
            user_response.raise_for_status()
            user = user_response.json()
            permission_response = await client.get(
                "https://api.github.com/repos/"
                f"{project['github_owner']}/{project['github_repo']}/collaborators/"
                f"{user['login']}/permission",
                headers=headers,
            )
            permission_response.raise_for_status()
            permission = permission_response.json().get("permission")
    except httpx.HTTPError:
        return _github_auth_redirect(project_id, "error", "GitHub permission check failed.")

    can_push = permission in GITHUB_WRITE_PERMISSIONS
    await db.projects.update_one(
        {"_id": project_id},
        {
            "$set": {
                "auth_provider": "github",
                "github_access_token": access_token,
                "github_user_login": user.get("login"),
                "github_user_id": user.get("id"),
                "github_permissions": {"pull": True, "push": can_push, "permission": permission},
                "access_mode": "write_enabled" if can_push else "read_only",
                "updated_at": utc_now(),
            }
        },
    )
    if not can_push:
        return _github_auth_redirect(project_id, "denied", "Your GitHub account does not have write access.")
    return _github_auth_redirect(project_id, "success")


@router.get("/{project_id}/files", response_model=list[FileEntryResponse])
async def list_project_files(project_id: str) -> list[FileEntryResponse]:
    try:
        return await list_files(project_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/{project_id}/reindex", response_model=ProjectResponse)
async def reindex_project_endpoint(project_id: str) -> ProjectResponse:
    try:
        project = await reindex_project(project_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return to_project_response(project)


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


@router.post("/{project_id}/commit-assistant/preview", response_model=CommitAssistantResponse)
async def preview_project_commit(
    project_id: str,
    payload: CommitAssistantRequest = Body(default_factory=CommitAssistantRequest),
) -> CommitAssistantResponse:
    try:
        return await prepare_commit(project_id, payload.context)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/{project_id}/commit-assistant/commit", response_model=CreateCommitResponse)
async def create_project_commit(
    project_id: str,
    payload: CreateCommitRequest,
) -> CreateCommitResponse:
    try:
        return await create_commit(project_id, payload.commit_message)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/{project_id}/edit-change-sets", response_model=EditChangeSetResponse)
async def create_project_edit_change_set(
    project_id: str,
    payload: CreateEditChangeSetRequest,
) -> EditChangeSetResponse:
    try:
        operations = [operation.model_dump() for operation in payload.operations]
        return await create_edit_change_set(project_id, operations)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post(
    "/{project_id}/edit-change-sets/{change_set_id}/apply",
    response_model=EditChangeSetResponse,
)
async def apply_project_edit_change_set(
    project_id: str,
    change_set_id: str,
) -> EditChangeSetResponse:
    try:
        return await apply_edit_change_set(project_id, change_set_id)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post(
    "/{project_id}/edit-change-sets/{change_set_id}/reject",
    response_model=EditChangeSetResponse,
)
async def reject_project_edit_change_set(
    project_id: str,
    change_set_id: str,
) -> EditChangeSetResponse:
    try:
        return await reject_edit_change_set(project_id, change_set_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post(
    "/{project_id}/edit-change-sets/{change_set_id}/rollback",
    response_model=EditChangeSetResponse,
)
async def rollback_project_edit_change_set(
    project_id: str,
    change_set_id: str,
) -> EditChangeSetResponse:
    try:
        return await rollback_edit_change_set(project_id, change_set_id)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/{project_id}", status_code=204)
async def delete_project(project_id: str) -> None:
    project = await db.projects.find_one({"_id": project_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    await db.chat_messages.delete_many({"project_id": project_id})
    await db.chats.delete_many({"project_id": project_id})
    await db.edit_change_sets.delete_many({"project_id": project_id})
    await db.projects.delete_one({"_id": project_id})

    await delete_collection(project_id)

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
