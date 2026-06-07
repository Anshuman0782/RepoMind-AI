from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Depends

from app.core.database import db
from app.core.security import get_current_user
from app.models.schemas import (
    ChangePlanRequest,
    ChatMessageResponse,
    ChatRequest,
    ChatResponse,
    ChatSessionResponse,
    CodeReviewRequest,
    CreateChatSessionRequest,
    InvestigationRequest,
    SourceChunk,
    UpdateChatSessionRequest,
)
from app.services.chat_answer_service import direct_chat_answer
from app.services.context_utils import full_file_chunks_for_message, merge_context_chunks
from app.services.documentation_service import (
    generate_documentation,
    generate_readme_file_change,
    is_documentation_request,
    is_readme_file_request,
)
from app.services.investigation_service import investigate_codebase
from app.services.language_utils import (
    MULTILINGUAL_BUG_TERMS,
    MULTILINGUAL_ARCHITECTURE_TERMS,
    MULTILINGUAL_ARCHITECTURE_VIEW_TERMS,
    MULTILINGUAL_CHANGE_TERMS,
    MULTILINGUAL_COMMIT_TERMS,
    MULTILINGUAL_NAVIGATION_TERMS,
    MULTILINGUAL_REVIEW_TERMS,
    contains_any_term,
    message_with_language_instruction,
)
from app.services.llm_provider import LLMProviderError, generate_answer
from app.services.planner_service import plan_change, requested_file_intent
from app.services.repo_service import project_has_write_access, project_status_error
from app.services.review_service import review_changes
from app.services.vector_store import search_chunks


router = APIRouter()


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def title_from_question(question: str) -> str:
    title = " ".join(question.strip().split())
    if len(title) > 60:
        return f"{title[:57].rstrip()}..."
    return title or "New chat"


def to_chat_session_response(chat: dict) -> ChatSessionResponse:
    return ChatSessionResponse(
        id=chat["_id"],
        project_id=chat["project_id"],
        title=chat["title"],
        created_at=chat["created_at"].isoformat(),
        updated_at=chat["updated_at"].isoformat(),
    )


def route_chat_agent(message: str) -> str:
    lowered = message.lower()
    if is_architecture_view_request(message):
        return "architecture"
    if is_readme_file_request(message):
        return "readme_editor"
    if is_file_change_request(message):
        return "planner"
    if is_documentation_request(message):
        return "documentation"
    if contains_any_term(message, MULTILINGUAL_REVIEW_TERMS):
        return "review"
    if contains_any_term(message, MULTILINGUAL_COMMIT_TERMS):
        return "commit"
    if contains_any_term(message, MULTILINGUAL_BUG_TERMS) or "does nothing" in lowered:
        return "bug_investigation"
    if contains_any_term(message, MULTILINGUAL_NAVIGATION_TERMS):
        return "navigator"
    return "chat"


def routed_answer(
    agent: str,
    answer: str,
    message: str = "",
    response_language: str | None = "auto",
) -> str:
    if response_language not in (None, "auto", "en") or any(ord(char) > 127 for char in message):
        return answer

    labels = {
        "planner": "Planner Agent",
        "readme_editor": "README Agent",
        "documentation": "Documentation Agent",
        "architecture": "Architecture Agent",
        "bug_investigation": "Bug Investigation Agent",
        "navigator": "Navigator Agent",
        "review": "Review Agent",
        "commit": "Commit Assistant",
    }
    label = labels.get(agent)
    if not label:
        return answer
    if agent == "readme_editor":
        reason = "you asked to create or update README documentation"
        safety = "The README draft is prepared as an edit preview so you can approve it before any file changes."
    elif agent == "planner":
        reason = "this looks like a file change request"
        safety = "No files will change until you approve the edit preview."
    elif agent == "review":
        reason = "you asked to inspect the current changes"
        safety = "Tests are suggested only; nothing is run automatically."
    elif agent == "commit":
        reason = "you asked for commit or pull request help"
        safety = "Use the Commit workspace to approve the actual commit and push."
    elif agent == "architecture":
        reason = "you asked to view the repository architecture"
        safety = "The interactive architecture map is opened in the Architecture workspace."
    else:
        reason = "this needs a specialized codebase investigation"
        safety = "The result is saved here with source references."
    return f"**Routed to {label}**\nRepoMind routed this to {label} because {reason}. {safety}\n\n{answer}"


def workspace_for_agent(agent: str) -> str | None:
    if agent in {"planner", "readme_editor"}:
        return "planner"
    if agent in {"bug_investigation", "navigator"}:
        return "navigator"
    if agent == "review":
        return "review"
    if agent == "commit":
        return "commit"
    if agent == "architecture":
        return "architecture"
    if agent == "documentation":
        return "chat"
    return None


def is_architecture_view_request(message: str) -> bool:
    lowered = message.lower()
    edit_terms = (
        "add",
        "create",
        "edit",
        "modify",
        "update",
        "write",
        "generate",
        "replace",
        "readme",
        "readme.md",
    )
    if any(term in lowered for term in edit_terms):
        return False

    if not contains_any_term(message, MULTILINGUAL_ARCHITECTURE_TERMS):
        return False
    return (
        contains_any_term(message, MULTILINGUAL_ARCHITECTURE_VIEW_TERMS)
        or lowered.strip() in MULTILINGUAL_ARCHITECTURE_TERMS
    )


def is_file_change_request(message: str) -> bool:
    return contains_any_term(message, MULTILINGUAL_CHANGE_TERMS)


def append_editor_redirect(answer: str, path: str | None) -> str:
    target = f" for `{path}`" if path else ""
    return (
        f"{answer}\n\n"
        "**Editor handoff**\n"
        f"This looks like an edit request{target}. Chat prepared the context, but full-file edits are safer in Editor where you can load the current file, revise it, preview the diff, and approve."
    )


def read_only_edit_notice() -> str:
    return (
        "**Write Access Required**\n"
        "This imported GitHub repo is currently read-only. You can still use RepoMind for debugging, "
        "repo Q&A, documentation, investigations, and change planning. To create, edit, delete, commit, "
        "or push files, connect GitHub and grant write access to this repository."
    )


def suppress_read_only_edit_preview(
    answer: str,
    proposed_operations: list[dict] | None,
    project: dict,
) -> tuple[str, list[dict] | None, bool]:
    if not proposed_operations or project_has_write_access(project):
        return answer, proposed_operations, False
    return f"{answer}\n\n{read_only_edit_notice()}", None, True


async def create_chat_session(project_id: str, title: str | None = None, user_id: str | None = None) -> dict:
    query = {"_id": project_id}
    if user_id:
        query["user_id"] = user_id
    project = await db.projects.find_one(query)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    now = utc_now()
    chat = {
        "_id": str(uuid4()),
        "project_id": project_id,
        "title": title_from_question(title or "New chat"),
        "created_at": now,
        "updated_at": now,
    }
    await db.chats.insert_one(chat)
    return chat


async def ensure_project_ready_for_chat(project_id: str, user_id: str | None = None) -> None:
    query = {"_id": project_id}
    if user_id:
        query["user_id"] = user_id
    project = await db.projects.find_one(query)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    error = project_status_error(project)
    if error:
        raise HTTPException(status_code=409, detail=error)


@router.post("/projects/{project_id}/chats", response_model=ChatSessionResponse)
async def create_chat_session_endpoint(
    project_id: str,
    payload: CreateChatSessionRequest,
    current_user: dict = Depends(get_current_user),
) -> ChatSessionResponse:
    chat = await create_chat_session(project_id, payload.title, user_id=current_user["_id"])
    return to_chat_session_response(chat)


@router.get("/projects/{project_id}/chats", response_model=list[ChatSessionResponse])
async def list_chat_sessions(
    project_id: str,
    current_user: dict = Depends(get_current_user),
) -> list[ChatSessionResponse]:
    project = await db.projects.find_one({"_id": project_id, "user_id": current_user["_id"]})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    chat_count = await db.chats.count_documents({"project_id": project_id})
    legacy_message_count = await db.chat_messages.count_documents(
        {"project_id": project_id, "chat_id": {"$exists": False}}
    )
    if chat_count == 0 and legacy_message_count > 0:
        chat = await create_chat_session(project_id, "Imported history", user_id=current_user["_id"])
        await db.chat_messages.update_many(
            {"project_id": project_id, "chat_id": {"$exists": False}},
            {"$set": {"chat_id": chat["_id"]}},
        )

    chats = []
    cursor = db.chats.find({"project_id": project_id}).sort("updated_at", -1)
    async for chat in cursor:
        chats.append(to_chat_session_response(chat))
    return chats


@router.patch(
    "/projects/{project_id}/chats/{chat_id}",
    response_model=ChatSessionResponse,
)
async def update_chat_session(
    project_id: str,
    chat_id: str,
    payload: UpdateChatSessionRequest,
    current_user: dict = Depends(get_current_user),
) -> ChatSessionResponse:
    project = await db.projects.find_one({"_id": project_id, "user_id": current_user["_id"]})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    now = utc_now()
    result = await db.chats.update_one(
        {"_id": chat_id, "project_id": project_id},
        {
            "$set": {
                "title": title_from_question(payload.title),
                "updated_at": now,
            }
        },
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Chat not found")

    chat = await db.chats.find_one({"_id": chat_id, "project_id": project_id})
    return to_chat_session_response(chat)


@router.delete("/projects/{project_id}/chats/{chat_id}", status_code=204)
async def delete_chat_session(
    project_id: str,
    chat_id: str,
    current_user: dict = Depends(get_current_user),
) -> None:
    project = await db.projects.find_one({"_id": project_id, "user_id": current_user["_id"]})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    chat_session = await db.chats.find_one({"_id": chat_id, "project_id": project_id})
    if not chat_session:
        raise HTTPException(status_code=404, detail="Chat not found")

    await db.chat_messages.delete_many({"project_id": project_id, "chat_id": chat_id})
    await db.chats.delete_one({"_id": chat_id, "project_id": project_id})


@router.post("", response_model=ChatResponse)
async def chat(
    payload: ChatRequest,
    current_user: dict = Depends(get_current_user),
) -> ChatResponse:
    chat_session = await db.chats.find_one(
        {"_id": payload.chat_id, "project_id": payload.project_id}
    )
    if not chat_session:
        raise HTTPException(status_code=404, detail="Chat not found")
    project = await db.projects.find_one({"_id": payload.project_id, "user_id": current_user["_id"]})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    await ensure_project_ready_for_chat(payload.project_id, user_id=current_user["_id"])

    routed_agent = route_chat_agent(payload.message)
    proposed_operations = None
    suggested_action = None
    suggested_path = None
    suggested_workspace_mode = workspace_for_agent(routed_agent)

    localized_message = message_with_language_instruction(
        payload.message,
        payload.response_language,
    )

    if routed_agent == "readme_editor":
        answer, sources, proposed_operations = await generate_readme_file_change(
            payload.project_id,
            localized_message,
        )
        answer = routed_answer(routed_agent, answer, payload.message, payload.response_language)
    elif routed_agent == "documentation":
        answer, sources = await generate_documentation(payload.project_id, localized_message)
        answer = routed_answer(routed_agent, answer, payload.message, payload.response_language)
    elif routed_agent == "planner":
        answer, sources, proposed_operations = await plan_change(
            payload.project_id,
            localized_message,
        )
        file_intent = requested_file_intent(payload.message)
        suggested_action = file_intent["action"]
        suggested_path = file_intent["path"]
        if suggested_action == "edit" and not proposed_operations:
            suggested_workspace_mode = "editor"
            answer = append_editor_redirect(answer, suggested_path)
        answer = routed_answer(routed_agent, answer, payload.message, payload.response_language)
    elif routed_agent in {"bug_investigation", "navigator"}:
        mode = "bug" if routed_agent == "bug_investigation" else "navigator"
        answer, sources = await investigate_codebase(
            payload.project_id,
            payload.message,
            mode,
            payload.response_language,
        )
        answer = routed_answer(routed_agent, answer, payload.message, payload.response_language)
    elif routed_agent == "review":
        try:
            answer, sources = await review_changes(payload.project_id, localized_message)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        answer = routed_answer(routed_agent, answer, payload.message, payload.response_language)
    elif routed_agent == "commit":
        sources = []
        answer = routed_answer(
            routed_agent,
            "I can help draft commit and PR copy from the current diff. Open the Commit workspace, or ask for a code review first if you want one more check before committing.",
            payload.message,
            payload.response_language,
        )
    elif routed_agent == "architecture":
        sources = []
        answer = routed_answer(
            routed_agent,
            "I opened the Architecture workspace so you can inspect the repo as an interactive map. Use the focus controls to switch between overview, frontend, backend, and data-oriented layers.",
            payload.message,
            payload.response_language,
        )
    else:
        chunks = await search_chunks(payload.project_id, payload.message)
        chunks = await _augment_chat_context(payload.project_id, payload.message, chunks)
        answer = None
        if payload.response_language in (None, "auto", "en"):
            answer = direct_chat_answer(payload.message, chunks)
        if answer is None:
            try:
                answer = await generate_answer(localized_message, chunks)
            except LLMProviderError as exc:
                raise HTTPException(status_code=503, detail=str(exc)) from exc

        sources = [SourceChunk(**chunk) for chunk in chunks]

    answer, proposed_operations, write_access_required = suppress_read_only_edit_preview(
        answer,
        proposed_operations,
        project,
    )

    now = utc_now()
    await db.chat_messages.insert_one(
        {
            "_id": str(uuid4()),
            "project_id": payload.project_id,
            "chat_id": payload.chat_id,
            "question": payload.message,
            "answer": answer,
            "sources": [source.model_dump() for source in sources],
            "created_at": now,
        }
    )
    update_fields = {"updated_at": now}
    existing_messages = await db.chat_messages.count_documents(
        {"project_id": payload.project_id, "chat_id": payload.chat_id}
    )
    if existing_messages == 1 and chat_session["title"] == "New chat":
        update_fields["title"] = title_from_question(payload.message)
    await db.chats.update_one({"_id": payload.chat_id}, {"$set": update_fields})

    agent_status = "approval_required" if proposed_operations else "completed"
    if write_access_required:
        agent_status = "write_access_required"
    if suggested_workspace_mode == "editor" and suggested_action == "edit":
        agent_status = "write_access_required" if not project_has_write_access(project) else "redirect_required"
    if suggested_workspace_mode == "architecture":
        agent_status = "redirect_required"
    return ChatResponse(
        answer=answer,
        sources=sources,
        proposed_operations=proposed_operations,
        routed_agent=routed_agent if routed_agent != "chat" else None,
        agent_status=agent_status if routed_agent != "chat" else None,
        suggested_workspace_mode=suggested_workspace_mode,
        suggested_action=suggested_action,
        suggested_path=suggested_path,
    )


async def _augment_chat_context(project_id: str, message: str, chunks: list[dict]) -> list[dict]:
    full_file_chunks = await full_file_chunks_for_message(project_id, message)
    return merge_context_chunks(full_file_chunks, chunks)


@router.post("/investigate", response_model=ChatResponse)
async def investigate(
    payload: InvestigationRequest,
    current_user: dict = Depends(get_current_user),
) -> ChatResponse:
    chat_session = await db.chats.find_one(
        {"_id": payload.chat_id, "project_id": payload.project_id}
    )
    if not chat_session:
        raise HTTPException(status_code=404, detail="Chat not found")
    project = await db.projects.find_one({"_id": payload.project_id, "user_id": current_user["_id"]})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    await ensure_project_ready_for_chat(payload.project_id, user_id=current_user["_id"])

    answer, sources = await investigate_codebase(
        payload.project_id,
        payload.message,
        payload.mode,
        payload.response_language,
    )
    now = utc_now()
    label = "Bug investigation" if payload.mode == "bug" else "Repo navigator"
    question = f"{label}: {payload.message}"
    await db.chat_messages.insert_one(
        {
            "_id": str(uuid4()),
            "project_id": payload.project_id,
            "chat_id": payload.chat_id,
            "question": question,
            "answer": answer,
            "sources": [source.model_dump() for source in sources],
            "created_at": now,
        }
    )
    update_fields = {"updated_at": now}
    existing_messages = await db.chat_messages.count_documents(
        {"project_id": payload.project_id, "chat_id": payload.chat_id}
    )
    if existing_messages == 1 and chat_session["title"] == "New chat":
        update_fields["title"] = title_from_question(payload.message)
    await db.chats.update_one({"_id": payload.chat_id}, {"$set": update_fields})

    return ChatResponse(answer=answer, sources=sources)


@router.post("/plan", response_model=ChatResponse)
async def create_change_plan(
    payload: ChangePlanRequest,
    current_user: dict = Depends(get_current_user),
) -> ChatResponse:
    chat_session = await db.chats.find_one(
        {"_id": payload.chat_id, "project_id": payload.project_id}
    )
    if not chat_session:
        raise HTTPException(status_code=404, detail="Chat not found")
    project = await db.projects.find_one({"_id": payload.project_id, "user_id": current_user["_id"]})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    await ensure_project_ready_for_chat(payload.project_id, user_id=current_user["_id"])

    if is_documentation_request(payload.message):
        project = await db.projects.find_one({"_id": payload.project_id})
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        if is_readme_file_request(payload.message):
            answer, sources, proposed_operations = await generate_readme_file_change(
                payload.project_id,
                message_with_language_instruction(payload.message, payload.response_language),
            )
            answer, proposed_operations, _write_access_required = suppress_read_only_edit_preview(
                answer,
                proposed_operations,
                project,
            )
        else:
            answer, sources = await generate_documentation(
                payload.project_id,
                message_with_language_instruction(payload.message, payload.response_language),
            )
            proposed_operations = None
        question = f"Documentation agent: {payload.message}"
    else:
        project = await db.projects.find_one({"_id": payload.project_id})
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        answer, sources, proposed_operations = await plan_change(
            payload.project_id,
            message_with_language_instruction(payload.message, payload.response_language),
        )
        answer, proposed_operations, _write_access_required = suppress_read_only_edit_preview(
            answer,
            proposed_operations,
            project,
        )
        question = f"Change planner: {payload.message}"
    now = utc_now()
    await db.chat_messages.insert_one(
        {
            "_id": str(uuid4()),
            "project_id": payload.project_id,
            "chat_id": payload.chat_id,
            "question": question,
            "answer": answer,
            "sources": [source.model_dump() for source in sources],
            "created_at": now,
        }
    )
    update_fields = {"updated_at": now}
    existing_messages = await db.chat_messages.count_documents(
        {"project_id": payload.project_id, "chat_id": payload.chat_id}
    )
    if existing_messages == 1 and chat_session["title"] == "New chat":
        update_fields["title"] = title_from_question(payload.message)
    await db.chats.update_one({"_id": payload.chat_id}, {"$set": update_fields})

    return ChatResponse(answer=answer, sources=sources, proposed_operations=proposed_operations)


@router.post("/review", response_model=ChatResponse)
async def create_code_review(
    payload: CodeReviewRequest,
    current_user: dict = Depends(get_current_user),
) -> ChatResponse:
    chat_session = await db.chats.find_one(
        {"_id": payload.chat_id, "project_id": payload.project_id}
    )
    if not chat_session:
        raise HTTPException(status_code=404, detail="Chat not found")
    project = await db.projects.find_one({"_id": payload.project_id, "user_id": current_user["_id"]})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    await ensure_project_ready_for_chat(payload.project_id, user_id=current_user["_id"])

    try:
        answer, sources = await review_changes(
            payload.project_id,
            message_with_language_instruction(payload.message or "", payload.response_language),
            payload.change_set_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    now = utc_now()
    review_context = payload.message.strip() if payload.message else "Current diff"
    question = f"Code review: {review_context}"
    await db.chat_messages.insert_one(
        {
            "_id": str(uuid4()),
            "project_id": payload.project_id,
            "chat_id": payload.chat_id,
            "question": question,
            "answer": answer,
            "sources": [source.model_dump() for source in sources],
            "created_at": now,
        }
    )
    update_fields = {"updated_at": now}
    existing_messages = await db.chat_messages.count_documents(
        {"project_id": payload.project_id, "chat_id": payload.chat_id}
    )
    if existing_messages == 1 and chat_session["title"] == "New chat":
        update_fields["title"] = title_from_question(review_context)
    await db.chats.update_one({"_id": payload.chat_id}, {"$set": update_fields})

    return ChatResponse(answer=answer, sources=sources)


@router.get(
    "/projects/{project_id}/chats/{chat_id}/messages",
    response_model=list[ChatMessageResponse],
)
async def list_chat_session_messages(
    project_id: str,
    chat_id: str,
    current_user: dict = Depends(get_current_user),
) -> list[ChatMessageResponse]:
    project = await db.projects.find_one({"_id": project_id, "user_id": current_user["_id"]})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    chat_session = await db.chats.find_one({"_id": chat_id, "project_id": project_id})
    if not chat_session:
        raise HTTPException(status_code=404, detail="Chat not found")

    messages = []
    cursor = db.chat_messages.find({"project_id": project_id, "chat_id": chat_id}).sort(
        "created_at", 1
    )
    async for message in cursor:
        messages.append(
            ChatMessageResponse(
                id=message["_id"],
                project_id=message["project_id"],
                chat_id=message["chat_id"],
                question=message["question"],
                answer=message["answer"],
                sources=[SourceChunk(**source) for source in message.get("sources", [])],
                created_at=message["created_at"].isoformat(),
            )
        )
    return messages


@router.get("/{project_id}", response_model=list[ChatMessageResponse])
async def list_chat_messages(
    project_id: str,
    current_user: dict = Depends(get_current_user),
) -> list[ChatMessageResponse]:
    project = await db.projects.find_one({"_id": project_id, "user_id": current_user["_id"]})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    messages = []
    cursor = db.chat_messages.find({"project_id": project_id}).sort("created_at", 1)
    async for message in cursor:
        messages.append(
            ChatMessageResponse(
                id=message["_id"],
                project_id=message["project_id"],
                chat_id=message.get("chat_id", ""),
                question=message["question"],
                answer=message["answer"],
                sources=[SourceChunk(**source) for source in message.get("sources", [])],
                created_at=message["created_at"].isoformat(),
            )
        )
    return messages
