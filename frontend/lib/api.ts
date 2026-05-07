const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8001";

export type Project = {
  id: string;
  name: string;
  repo_url: string;
  status: string;
};

export type ChatSession = {
  id: string;
  project_id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export type ChatResponse = {
  answer: string;
  sources: {
    file_path: string;
    start_line: number;
    end_line: number;
    content: string;
  }[];
  proposed_operations?: FileEditOperation[] | null;
};

export type ChatMessageResponse = ChatResponse & {
  id: string;
  project_id: string;
  chat_id: string;
  question: string;
  created_at: string;
};

export type FileEntry = {
  path: string;
  name: string;
  size: number;
  modified_at: number;
};

export type FileContent = {
  path: string;
  content: string;
  size: number;
  line_count: number;
};

export type CodeSearchResult = {
  file_path: string;
  line_number: number;
  line: string;
};

export type FileEditOperation = {
  action: "create" | "edit" | "delete";
  path: string;
  content?: string;
};

export type EditChangeSet = {
  id: string;
  project_id: string;
  status: "pending" | "applied" | "rejected" | "rolled_back";
  files: string[];
  diff: string;
};

export type CommitAssistantPreview = {
  has_changes: boolean;
  changed_files: string[];
  commit_message: string;
  pr_title: string;
  pr_description: string;
  diff: string;
};

export type CreatedCommit = {
  commit_hash: string;
  commit_message: string;
  changed_files: string[];
  branch: string;
  remote: string;
  pushed: boolean;
  push_summary: string;
};

export async function createProject(name: string, repoUrl: string): Promise<Project> {
  const response = await fetch(`${API_BASE_URL}/api/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, repo_url: repoUrl }),
  });

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  return response.json();
}

export async function listProjects(): Promise<Project[]> {
  const response = await fetch(`${API_BASE_URL}/api/projects`);
  if (!response.ok) {
    throw new Error(await readApiError(response));
  }
  return response.json();
}

export async function deleteProject(projectId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/projects/${projectId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }
}

export async function reindexProject(projectId: string): Promise<Project> {
  const response = await fetch(`${API_BASE_URL}/api/projects/${projectId}/reindex`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  return response.json();
}

export async function listProjectFiles(projectId: string): Promise<FileEntry[]> {
  const response = await fetch(`${API_BASE_URL}/api/projects/${projectId}/files`);
  if (!response.ok) {
    throw new Error(await readApiError(response));
  }
  return response.json();
}

export async function readProjectFile(projectId: string, path: string): Promise<FileContent> {
  const params = new URLSearchParams({ path });
  const response = await fetch(`${API_BASE_URL}/api/projects/${projectId}/files/content?${params}`);
  if (!response.ok) {
    throw new Error(await readApiError(response));
  }
  return response.json();
}

export async function searchProjectCode(
  projectId: string,
  query: string,
): Promise<CodeSearchResult[]> {
  const params = new URLSearchParams({ query, limit: "100" });
  const response = await fetch(`${API_BASE_URL}/api/projects/${projectId}/search?${params}`);
  if (!response.ok) {
    throw new Error(await readApiError(response));
  }
  return response.json();
}

export async function getProjectGitDiff(projectId: string): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/api/projects/${projectId}/git-diff`);
  if (!response.ok) {
    throw new Error(await readApiError(response));
  }
  const payload = (await response.json()) as { diff: string };
  return payload.diff;
}

export async function previewCommitAssistant(
  projectId: string,
  context: string,
): Promise<CommitAssistantPreview> {
  const safeContext = context.trim().slice(0, 2000);
  const response = await fetch(`${API_BASE_URL}/api/projects/${projectId}/commit-assistant/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ context: safeContext }),
  });

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  return response.json();
}

export async function createCommit(
  projectId: string,
  commitMessage: string,
): Promise<CreatedCommit> {
  const response = await fetch(`${API_BASE_URL}/api/projects/${projectId}/commit-assistant/commit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ commit_message: commitMessage }),
  });

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  return response.json();
}

export async function createEditChangeSet(
  projectId: string,
  operations: FileEditOperation[],
): Promise<EditChangeSet> {
  const response = await fetch(`${API_BASE_URL}/api/projects/${projectId}/edit-change-sets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operations }),
  });

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  return response.json();
}

export async function applyEditChangeSet(
  projectId: string,
  changeSetId: string,
): Promise<EditChangeSet> {
  return updateEditChangeSet(projectId, changeSetId, "apply");
}

export async function rejectEditChangeSet(
  projectId: string,
  changeSetId: string,
): Promise<EditChangeSet> {
  return updateEditChangeSet(projectId, changeSetId, "reject");
}

export async function rollbackEditChangeSet(
  projectId: string,
  changeSetId: string,
): Promise<EditChangeSet> {
  return updateEditChangeSet(projectId, changeSetId, "rollback");
}

async function updateEditChangeSet(
  projectId: string,
  changeSetId: string,
  action: "apply" | "reject" | "rollback",
): Promise<EditChangeSet> {
  const response = await fetch(
    `${API_BASE_URL}/api/projects/${projectId}/edit-change-sets/${changeSetId}/${action}`,
    { method: "POST" },
  );

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  return response.json();
}

export async function createChatSession(projectId: string, title?: string): Promise<ChatSession> {
  const response = await fetch(`${API_BASE_URL}/api/chat/projects/${projectId}/chats`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  return response.json();
}

export async function listChatSessions(projectId: string): Promise<ChatSession[]> {
  const response = await fetch(`${API_BASE_URL}/api/chat/projects/${projectId}/chats`);
  if (!response.ok) {
    throw new Error(await readApiError(response));
  }
  return response.json();
}

export async function renameChatSession(
  projectId: string,
  chatId: string,
  title: string,
): Promise<ChatSession> {
  const response = await fetch(`${API_BASE_URL}/api/chat/projects/${projectId}/chats/${chatId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  return response.json();
}

export async function deleteChatSession(projectId: string, chatId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/chat/projects/${projectId}/chats/${chatId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }
}

export async function sendMessage(
  projectId: string,
  chatId: string,
  message: string,
): Promise<ChatResponse> {
  const response = await fetch(`${API_BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_id: projectId, chat_id: chatId, message }),
  });

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  return response.json();
}

export async function investigateCodebase(
  projectId: string,
  chatId: string,
  message: string,
  mode: "navigator" | "bug",
): Promise<ChatResponse> {
  const response = await fetch(`${API_BASE_URL}/api/chat/investigate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      project_id: projectId,
      chat_id: chatId,
      message,
      mode,
    }),
  });

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  return response.json();
}

export async function createChangePlan(
  projectId: string,
  chatId: string,
  message: string,
): Promise<ChatResponse> {
  const response = await fetch(`${API_BASE_URL}/api/chat/plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      project_id: projectId,
      chat_id: chatId,
      message,
    }),
  });

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  return response.json();
}

export async function reviewCodeChanges(
  projectId: string,
  chatId: string,
  message?: string,
  changeSetId?: string,
): Promise<ChatResponse> {
  const response = await fetch(`${API_BASE_URL}/api/chat/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      project_id: projectId,
      chat_id: chatId,
      message: message || undefined,
      change_set_id: changeSetId || undefined,
    }),
  });

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  return response.json();
}

export async function listChatMessages(
  projectId: string,
  chatId: string,
): Promise<ChatMessageResponse[]> {
  const response = await fetch(`${API_BASE_URL}/api/chat/projects/${projectId}/chats/${chatId}/messages`);
  if (!response.ok) {
    throw new Error(await readApiError(response));
  }
  return response.json();
}

async function readApiError(response: Response): Promise<string> {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text) as { detail?: string };
    return parsed.detail ?? text;
  } catch {
    return text || `Request failed with status ${response.status}`;
  }
}
