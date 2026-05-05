from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, HTTPException

from app.core.database import db
from app.models.schemas import (
    ChatMessageResponse,
    ChatRequest,
    ChatResponse,
    ChatSessionResponse,
    CreateChatSessionRequest,
    SourceChunk,
)
from app.services.llm_provider import LLMProviderError, generate_answer
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


async def create_chat_session(project_id: str, title: str | None = None) -> dict:
    project = await db.projects.find_one({"_id": project_id})
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


@router.post("/projects/{project_id}/chats", response_model=ChatSessionResponse)
async def create_chat_session_endpoint(
    project_id: str, payload: CreateChatSessionRequest
) -> ChatSessionResponse:
    chat = await create_chat_session(project_id, payload.title)
    return to_chat_session_response(chat)


@router.get("/projects/{project_id}/chats", response_model=list[ChatSessionResponse])
async def list_chat_sessions(project_id: str) -> list[ChatSessionResponse]:
    project = await db.projects.find_one({"_id": project_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    chat_count = await db.chats.count_documents({"project_id": project_id})
    legacy_message_count = await db.chat_messages.count_documents(
        {"project_id": project_id, "chat_id": {"$exists": False}}
    )
    if chat_count == 0 and legacy_message_count > 0:
        chat = await create_chat_session(project_id, "Imported history")
        await db.chat_messages.update_many(
            {"project_id": project_id, "chat_id": {"$exists": False}},
            {"$set": {"chat_id": chat["_id"]}},
        )

    chats = []
    cursor = db.chats.find({"project_id": project_id}).sort("updated_at", -1)
    async for chat in cursor:
        chats.append(to_chat_session_response(chat))
    return chats


@router.post("", response_model=ChatResponse)
async def chat(payload: ChatRequest) -> ChatResponse:
    chat_session = await db.chats.find_one(
        {"_id": payload.chat_id, "project_id": payload.project_id}
    )
    if not chat_session:
        raise HTTPException(status_code=404, detail="Chat not found")

    chunks = await search_chunks(payload.project_id, payload.message)
    try:
        answer = await generate_answer(payload.message, chunks)
    except LLMProviderError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    sources = [SourceChunk(**chunk) for chunk in chunks]
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

    return ChatResponse(answer=answer, sources=sources)


@router.get(
    "/projects/{project_id}/chats/{chat_id}/messages",
    response_model=list[ChatMessageResponse],
)
async def list_chat_session_messages(
    project_id: str, chat_id: str
) -> list[ChatMessageResponse]:
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
async def list_chat_messages(project_id: str) -> list[ChatMessageResponse]:
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
