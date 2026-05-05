from fastapi import APIRouter, HTTPException

from app.core.database import db
from app.models.schemas import CreateProjectRequest, ProjectResponse
from app.services.repo_service import create_project


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

