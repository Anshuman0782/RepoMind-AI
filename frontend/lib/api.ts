const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

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
};

export type ChatMessageResponse = ChatResponse & {
  id: string;
  project_id: string;
  chat_id: string;
  question: string;
  created_at: string;
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
