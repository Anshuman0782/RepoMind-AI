from pydantic import BaseModel, Field, HttpUrl


class CreateProjectRequest(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    repo_url: HttpUrl


class ProjectResponse(BaseModel):
    id: str
    name: str
    repo_url: str
    status: str
    access_mode: str = "read_only"
    auth_provider: str | None = None
    github_owner: str | None = None
    github_repo: str | None = None
    github_user_login: str | None = None
    github_permissions: dict = Field(default_factory=dict)


class GitHubAuthStartResponse(BaseModel):
    auth_url: str
    state: str


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
    response_language: str | None = Field(default="auto", max_length=20)


class InvestigationRequest(BaseModel):
    project_id: str
    chat_id: str
    message: str = Field(min_length=1)
    mode: str = Field(pattern="^(navigator|bug)$")
    response_language: str | None = Field(default="auto", max_length=20)


class ChangePlanRequest(BaseModel):
    project_id: str
    chat_id: str
    message: str = Field(min_length=1)
    response_language: str | None = Field(default="auto", max_length=20)


class CodeReviewRequest(BaseModel):
    project_id: str
    chat_id: str
    message: str | None = Field(default=None, max_length=2000)
    change_set_id: str | None = None
    response_language: str | None = Field(default="auto", max_length=20)


class CommitAssistantRequest(BaseModel):
    context: str | None = Field(default=None, max_length=2000)


class CommitAssistantResponse(BaseModel):
    has_changes: bool
    changed_files: list[str]
    commit_message: str
    pr_title: str
    pr_description: str
    diff: str


class CreateCommitRequest(BaseModel):
    commit_message: str = Field(min_length=3, max_length=2000)


class CreateCommitResponse(BaseModel):
    commit_hash: str
    commit_message: str
    changed_files: list[str]
    branch: str
    remote: str
    pushed: bool
    push_summary: str


class SourceChunk(BaseModel):
    file_path: str
    start_line: int
    end_line: int
    content: str


class ChatResponse(BaseModel):
    answer: str
    sources: list[SourceChunk]
    proposed_operations: list[FileEditOperation] | None = None
    routed_agent: str | None = None
    agent_status: str | None = None
    suggested_workspace_mode: str | None = None
    suggested_action: str | None = None
    suggested_path: str | None = None


class ChatMessageResponse(BaseModel):
    id: str
    project_id: str
    chat_id: str
    question: str
    answer: str
    sources: list[SourceChunk]
    created_at: str


class UserRegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    email: str = Field(min_length=5, max_length=100)
    password: str = Field(min_length=6, max_length=100)


class UserLoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=100)
    password: str = Field(min_length=6, max_length=100)


class UserAuthResponse(BaseModel):
    id: str
    username: str
    email: str
    has_github: bool = False
    github_user_login: str | None = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "Bearer"
    user: UserAuthResponse


class ForgotPasswordRequest(BaseModel):
    email: str = Field(min_length=5, max_length=100)


class ResetPasswordRequest(BaseModel):
    email: str = Field(min_length=5, max_length=100)
    otp: str = Field(min_length=4, max_length=10)
    new_password: str = Field(min_length=6, max_length=100)


class GitHubLoginRequest(BaseModel):
    code: str
    state: str | None = None


class UserProfileUpdateRequest(BaseModel):
    username: str = Field(min_length=3, max_length=50)


class UserPasswordUpdateRequest(BaseModel):
    current_password: str = Field(min_length=6, max_length=100)
    new_password: str = Field(min_length=6, max_length=100)

