from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, HTTPException

from app.core.database import db
from app.models.schemas import ChatMessageResponse, ChatRequest, ChatResponse, SourceChunk
from app.services.llm_provider import LLMProviderError, generate_answer
from app.services.vector_store import search_chunks


router = APIRouter()


@router.post("", response_model=ChatResponse)
async def chat(payload: ChatRequest) -> ChatResponse:
    chunks = await search_chunks(payload.project_id, payload.message)
    try:
        answer = await generate_answer(payload.message, chunks)
    except LLMProviderError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    sources = [SourceChunk(**chunk) for chunk in chunks]
    await db.chat_messages.insert_one(
        {
            "_id": str(uuid4()),
            "project_id": payload.project_id,
            "question": payload.message,
            "answer": answer,
            "sources": [source.model_dump() for source in sources],
            "created_at": datetime.now(timezone.utc),
        }
    )

    return ChatResponse(answer=answer, sources=sources)


@router.get("/{project_id}", response_model=list[ChatMessageResponse])
async def list_chat_messages(project_id: str) -> list[ChatMessageResponse]:
    messages = []
    cursor = db.chat_messages.find({"project_id": project_id}).sort("created_at", 1)
    async for message in cursor:
        messages.append(
            ChatMessageResponse(
                id=message["_id"],
                project_id=message["project_id"],
                question=message["question"],
                answer=message["answer"],
                sources=[SourceChunk(**source) for source in message.get("sources", [])],
                created_at=message["created_at"].isoformat(),
            )
        )
    return messages
