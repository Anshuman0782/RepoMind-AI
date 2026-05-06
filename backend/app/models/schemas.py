from pydantic import BaseModel, Field, HttpUrl


class CreateProjectRequest(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    repo_url: HttpUrl


class ProjectResponse(BaseModel):
    id: str
    name: str
    repo_url: str
    status: str


class FileEntryResponse(BaseModel):
    path: str
    name: str
    size: int
    modified_at: float


class FileContentResponse(BaseModel):
    path: str
    content: str
    size: int
    line_count: int


class CodeSearchResultResponse(BaseModel):
    file_path: str
    line_number: int
    line: str


class GitDiffResponse(BaseModel):
    diff: str


class FileEditOperation(BaseModel):
    action: str = Field(pattern="^(create|edit|delete)$")
    path: str = Field(min_length=1, max_length=500)
    content: str | None = None


class CreateEditChangeSetRequest(BaseModel):
    operations: list[FileEditOperation] = Field(min_length=1, max_length=20)


class EditChangeSetResponse(BaseModel):
    id: str
    project_id: str
    status: str
    files: list[str]
    diff: str


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


class InvestigationRequest(BaseModel):
    project_id: str
    chat_id: str
    message: str = Field(min_length=1)
    mode: str = Field(pattern="^(navigator|bug)$")


class ChangePlanRequest(BaseModel):
    project_id: str
    chat_id: str
    message: str = Field(min_length=1)


class CodeReviewRequest(BaseModel):
    project_id: str
    chat_id: str
    message: str | None = Field(default=None, max_length=2000)
    change_set_id: str | None = None


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
