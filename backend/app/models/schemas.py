from pydantic import BaseModel, Field, HttpUrl


class CreateProjectRequest(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    repo_url: HttpUrl


class ProjectResponse(BaseModel):
    id: str
    name: str
    repo_url: str
    status: str


class CreateChatSessionRequest(BaseModel):
    title: str | None = Field(default=None, max_length=80)


class UpdateChatSessionRequest(BaseModel):
    title: str = Field(min_length=1, max_length=80)


class ChatSessionResponse(BaseModel):
    id: str
    project_id: str
    title: str
    created_at: str
    updated_at: str


class ChatRequest(BaseModel):
    project_id: str
    chat_id: str
    message: str = Field(min_length=1)


class SourceChunk(BaseModel):
    file_path: str
    start_line: int
    end_line: int
    content: str


class ChatResponse(BaseModel):
    answer: str
    sources: list[SourceChunk]


class ChatMessageResponse(BaseModel):
    id: str
    project_id: str
    chat_id: str
    question: str
    answer: str
    sources: list[SourceChunk]
    created_at: str
