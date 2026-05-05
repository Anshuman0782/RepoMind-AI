"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  ChatSession,
  ChatMessageResponse,
  ChatResponse,
  Project,
  createChatSession,
  createProject,
  deleteChatSession,
  listChatMessages,
  listChatSessions,
  listProjects,
  renameChatSession,
  sendMessage,
} from "@/lib/api";

type ChatMessage = {
  id: string;
  question: string;
  answer: string;
  sources: ChatResponse["sources"];
  createdAt: string;
};

function formatChatTime(value: string): string {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toChatMessage(message: ChatMessageResponse): ChatMessage {
  return {
    id: message.id,
    question: message.question,
    answer: message.answer,
    sources: message.sources,
    createdAt: formatChatTime(message.created_at),
  };
}

function titleFromQuestion(question: string): string {
  const title = question.trim().replace(/\s+/g, " ");
  return title.length > 60 ? `${title.slice(0, 57).trim()}...` : title || "New chat";
}

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedChatId, setSelectedChatId] = useState("");
  const [name, setName] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [message, setMessage] = useState("");
  const [chatsByProject, setChatsByProject] = useState<Record<string, ChatSession[]>>({});
  const [messagesByChat, setMessagesByChat] = useState<Record<string, ChatMessage[]>>({});
  const [projectSearch, setProjectSearch] = useState("");
  const [editingChatId, setEditingChatId] = useState("");
  const [editingTitle, setEditingTitle] = useState("");
  const [pendingAction, setPendingAction] = useState("");
  const [pendingQuestion, setPendingQuestion] = useState("");
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingChatsProjectId, setLoadingChatsProjectId] = useState("");
  const [loadingMessagesChatId, setLoadingMessagesChatId] = useState("");
  const [error, setError] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selectedProject = projects.find((project) => project.id === selectedProjectId);
  const projectChats = selectedProjectId ? chatsByProject[selectedProjectId] ?? [] : [];
  const selectedChat = projectChats.find((chat) => chat.id === selectedChatId);
  const currentMessages = selectedChatId ? messagesByChat[selectedChatId] ?? [] : [];
  const busy = pendingAction !== "";
  const isLoadingChats = loadingChatsProjectId === selectedProjectId;
  const isLoadingMessages = loadingMessagesChatId === selectedChatId;
  const filteredProjects = projects.filter((project) => {
    const term = projectSearch.trim().toLowerCase();
    if (!term) {
      return true;
    }
    return (
      project.name.toLowerCase().includes(term) ||
      project.repo_url.toLowerCase().includes(term)
    );
  });

  useEffect(() => {
    setLoadingProjects(true);
    listProjects()
      .then((items) => {
        setProjects(items);
        if (items[0]) {
          setSelectedProjectId(items[0].id);
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load projects");
      })
      .finally(() => {
        setLoadingProjects(false);
      });
  }, []);

  useEffect(() => {
    if (!selectedProjectId || chatsByProject[selectedProjectId]) {
      return;
    }

    setLoadingChatsProjectId(selectedProjectId);
    listChatSessions(selectedProjectId)
      .then((items) => {
        setChatsByProject((current) => ({
          ...current,
          [selectedProjectId]: items,
        }));
        setSelectedChatId(items[0]?.id || "");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load chats");
      })
      .finally(() => {
        setLoadingChatsProjectId("");
      });
  }, [chatsByProject, selectedProjectId]);

  useEffect(() => {
    if (!selectedChatId || messagesByChat[selectedChatId] || !selectedProjectId) {
      return;
    }

    setLoadingMessagesChatId(selectedChatId);
    listChatMessages(selectedProjectId, selectedChatId)
      .then((items) => {
        setMessagesByChat((current) => ({
          ...current,
          [selectedChatId]: items.map(toChatMessage),
        }));
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load chat history");
      })
      .finally(() => {
        setLoadingMessagesChatId("");
      });
  }, [messagesByChat, selectedChatId, selectedProjectId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentMessages.length, pendingQuestion, selectedChatId]);

  async function handleCreateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPendingAction("import");
    setError("");
    try {
      const project = await createProject(name, repoUrl);
      setProjects((current) => [project, ...current]);
      setSelectedProjectId(project.id);
      setSelectedChatId("");
      setChatsByProject((current) => ({ ...current, [project.id]: [] }));
      setName("");
      setRepoUrl("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setPendingAction("");
    }
  }

  async function handleCreateChat() {
    if (!selectedProjectId) {
      setError("Create or select a project first.");
      return;
    }

    setPendingAction("new-chat");
    setError("");
    try {
      const chat = await createChatSession(selectedProjectId);
      setChatsByProject((current) => ({
        ...current,
        [selectedProjectId]: [chat, ...(current[selectedProjectId] ?? [])],
      }));
      setMessagesByChat((current) => ({ ...current, [chat.id]: [] }));
      setSelectedChatId(chat.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create chat");
    } finally {
      setPendingAction("");
    }
  }

  async function handleRenameChat(event: FormEvent<HTMLFormElement>, chatId: string) {
    event.preventDefault();
    if (!selectedProjectId) {
      return;
    }

    const title = editingTitle.trim();
    if (!title) {
      setError("Chat title cannot be empty.");
      return;
    }

    setPendingAction("rename");
    setError("");
    try {
      const updatedChat = await renameChatSession(selectedProjectId, chatId, title);
      setChatsByProject((current) => ({
        ...current,
        [selectedProjectId]: (current[selectedProjectId] ?? []).map((chat) =>
          chat.id === chatId ? updatedChat : chat,
        ),
      }));
      setEditingChatId("");
      setEditingTitle("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename chat");
    } finally {
      setPendingAction("");
    }
  }

  async function handleDeleteChat(chatId: string) {
    if (!selectedProjectId) {
      return;
    }

    const confirmed = window.confirm(
      "Delete this chat and all of its messages from the database?",
    );
    if (!confirmed) {
      return;
    }

    setPendingAction("delete");
    setError("");
    try {
      await deleteChatSession(selectedProjectId, chatId);
      const remainingChats = projectChats.filter((chat) => chat.id !== chatId);
      setChatsByProject((current) => {
        return {
          ...current,
          [selectedProjectId]: remainingChats,
        };
      });
      if (selectedChatId === chatId) {
        setSelectedChatId(remainingChats[0]?.id ?? "");
      }
      setMessagesByChat((current) => {
        const next = { ...current };
        delete next[chatId];
        return next;
      });
      if (editingChatId === chatId) {
        setEditingChatId("");
        setEditingTitle("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete chat");
    } finally {
      setPendingAction("");
    }
  }

  async function handleChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProjectId) {
      setError("Create or select a project first.");
      return;
    }

    const submittedQuestion = message.trim();
    if (!submittedQuestion) {
      return;
    }

    setPendingAction("ask");
    setPendingQuestion(submittedQuestion);
    setError("");
    setMessage("");
    try {
      let activeChatId = selectedChatId;
      if (!activeChatId) {
        const chat = await createChatSession(selectedProjectId);
        activeChatId = chat.id;
        setSelectedChatId(chat.id);
        setChatsByProject((current) => ({
          ...current,
          [selectedProjectId]: [chat, ...(current[selectedProjectId] ?? [])],
        }));
      }

      const hadMessages = (messagesByChat[activeChatId] ?? []).length > 0;
      const response = await sendMessage(selectedProjectId, activeChatId, submittedQuestion);
      const chatMessage: ChatMessage = {
        id: crypto.randomUUID(),
        question: submittedQuestion,
        answer: response.answer,
        sources: response.sources,
        createdAt: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
      setMessagesByChat((current) => ({
        ...current,
        [activeChatId]: [...(current[activeChatId] ?? []), chatMessage],
      }));
      if (!hadMessages) {
        setChatsByProject((current) => ({
          ...current,
          [selectedProjectId]: (current[selectedProjectId] ?? []).map((chat) =>
            chat.id === activeChatId
              ? {
                  ...chat,
                  title: titleFromQuestion(submittedQuestion),
                  updated_at: new Date().toISOString(),
                }
              : chat,
          ),
        }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to ask question");
      setMessage(submittedQuestion);
    } finally {
      setPendingAction("");
      setPendingQuestion("");
    }
  }

  return (
    <main className="min-h-screen bg-white text-ink lg:h-screen lg:overflow-hidden">
      <div className="mx-auto grid min-h-screen max-w-7xl grid-cols-1 gap-0 lg:h-screen lg:grid-cols-[360px_1fr]">
        <aside className="flex min-h-0 flex-col border-b border-line bg-panel p-4 sm:p-6 lg:border-b-0 lg:border-r">
          <h1 className="text-2xl font-semibold leading-tight">RepoMind AI</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Import a public GitHub repo, index it, and ask grounded questions about the code.
          </p>

          <form className="mt-8 space-y-3" onSubmit={handleCreateProject}>
            <input
              className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent"
              placeholder="Project name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
            <input
              className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent"
              placeholder="https://github.com/user/repo"
              value={repoUrl}
              onChange={(event) => setRepoUrl(event.target.value)}
              required
            />
            <button
              className="w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
              disabled={busy}
            >
              {pendingAction === "import" ? "Importing..." : "Import Repo"}
            </button>
          </form>

          <div className="mt-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Projects</h2>
            <input
              className="mt-3 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent"
              placeholder="Search projects"
              value={projectSearch}
              onChange={(event) => setProjectSearch(event.target.value)}
            />
            <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1 lg:max-h-[calc(100vh-390px)]">
              {loadingProjects ? (
                <div className="space-y-2">
                  <div className="h-16 animate-pulse rounded-md bg-white" />
                  <div className="h-16 animate-pulse rounded-md bg-white" />
                </div>
              ) : null}
              {filteredProjects.map((project) => (
                <div key={project.id} className="space-y-1">
                  <button
                    type="button"
                    className={`w-full rounded-md border px-3 py-2 text-left text-sm transition ${
                      selectedProjectId === project.id
                        ? "border-accent bg-white shadow-sm"
                        : "border-line bg-transparent hover:border-zinc-400 hover:bg-white"
                    }`}
                    onClick={() => {
                      setSelectedProjectId(project.id);
                      setSelectedChatId(chatsByProject[project.id]?.[0]?.id ?? "");
                      setError("");
                    }}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{project.name}</span>
                      <span className="rounded bg-white px-1.5 py-0.5 text-[11px] uppercase text-zinc-500">
                        {project.status}
                      </span>
                    </span>
                    <span className="block truncate text-xs text-zinc-500">{project.repo_url}</span>
                  </button>
                  {selectedProjectId === project.id ? (
                    <div className="space-y-1 pl-3">
                      <button
                        type="button"
                        className="w-full rounded-md border border-dashed border-line px-3 py-2 text-left text-xs font-medium text-zinc-600 transition hover:border-zinc-400 hover:bg-white disabled:opacity-60"
                        onClick={handleCreateChat}
                        disabled={busy}
                      >
                        {pendingAction === "new-chat" ? "Creating chat..." : "+ New chat"}
                      </button>
                      {isLoadingChats ? (
                        <div className="rounded-md px-3 py-2 text-xs text-zinc-500">
                          Loading chats...
                        </div>
                      ) : null}
                      {!isLoadingChats && (chatsByProject[project.id] ?? []).length === 0 ? (
                        <div className="rounded-md px-3 py-2 text-xs text-zinc-500">
                          No chats yet.
                        </div>
                      ) : null}
                      {(chatsByProject[project.id] ?? []).map((chat) => (
                        <div key={chat.id} className="group flex items-center gap-1">
                          {editingChatId === chat.id ? (
                            <form
                              className="flex min-w-0 flex-1 items-center gap-1"
                              onSubmit={(event) => handleRenameChat(event, chat.id)}
                            >
                              <input
                                className="min-w-0 flex-1 rounded-md border border-line bg-white px-2 py-1.5 text-xs outline-none focus:border-accent"
                                value={editingTitle}
                                onChange={(event) => setEditingTitle(event.target.value)}
                                autoFocus
                              />
                              <button
                                type="submit"
                                className="rounded-md bg-ink px-2 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                                disabled={busy}
                              >
                                {pendingAction === "rename" ? "Saving" : "Save"}
                              </button>
                              <button
                                type="button"
                                className="rounded-md px-2 py-1.5 text-xs text-zinc-500 hover:bg-white hover:text-ink"
                                onClick={() => {
                                  setEditingChatId("");
                                  setEditingTitle("");
                                }}
                              >
                                Cancel
                              </button>
                            </form>
                          ) : (
                            <>
                              <button
                                type="button"
                                className={`min-w-0 flex-1 truncate rounded-md px-3 py-2 text-left text-xs transition ${
                                  selectedChatId === chat.id
                                    ? "bg-ink font-medium text-white"
                                    : "text-zinc-600 hover:bg-white hover:text-ink"
                                }`}
                                onClick={() => {
                                  setSelectedChatId(chat.id);
                                  setError("");
                                }}
                              >
                                {chat.title}
                              </button>
                              <button
                                type="button"
                                className="rounded-md px-2 py-2 text-xs text-zinc-500 opacity-100 hover:bg-white hover:text-ink lg:opacity-0 lg:group-hover:opacity-100"
                                onClick={() => {
                                  setEditingChatId(chat.id);
                                  setEditingTitle(chat.title);
                                }}
                                title="Rename chat"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="rounded-md px-2 py-2 text-xs text-red-500 opacity-100 hover:bg-red-50 lg:opacity-0 lg:group-hover:opacity-100"
                                onClick={() => handleDeleteChat(chat.id)}
                                title="Delete chat"
                                disabled={busy}
                              >
                                {pendingAction === "delete" ? "Deleting" : "Delete"}
                              </button>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
              {!loadingProjects && filteredProjects.length === 0 ? (
                <p className="rounded-md border border-dashed border-line px-3 py-4 text-center text-sm text-zinc-500">
                  No projects found.
                </p>
              ) : null}
            </div>
          </div>
        </aside>

        <section className="flex min-h-[620px] flex-col p-4 sm:p-6 lg:min-h-0">
          <div className="border-b border-line pb-5">
            <h2 className="break-words text-xl font-semibold">{selectedChat?.title ?? "Codebase Chat"}</h2>
            {selectedProject ? (
              <p className="mt-1 truncate text-sm text-zinc-600">
                Selected: <span className="font-medium text-ink">{selectedProject.name}</span>{" "}
                <span className="text-zinc-400">/</span> {selectedProject.repo_url}
              </p>
            ) : (
              <p className="mt-1 text-sm text-zinc-600">
                Import or select a project, then ask a question about the code.
              </p>
            )}
          </div>

          {error ? (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto py-6 pr-1">
            {isLoadingMessages ? (
              <div className="space-y-6">
                <div className="ml-auto h-20 max-w-[78%] animate-pulse rounded-md bg-zinc-200" />
                <div className="h-32 max-w-[88%] animate-pulse rounded-md border border-line bg-white" />
              </div>
            ) : currentMessages.length > 0 || pendingQuestion ? (
              <div className="space-y-6">
                {currentMessages.map((item) => (
                  <article key={item.id} className="space-y-3">
                    <div className="ml-auto max-w-full rounded-md bg-ink px-4 py-3 text-white sm:max-w-[78%]">
                      <div className="mb-1 text-xs font-medium text-zinc-300">You at {item.createdAt}</div>
                      <p className="whitespace-pre-wrap leading-6">{item.question}</p>
                    </div>

                    <div className="max-w-full rounded-md border border-line bg-white px-4 py-3 sm:max-w-[88%]">
                      <div className="mb-2 flex items-center justify-between gap-3 text-xs font-semibold uppercase text-zinc-500">
                        <span>RepoMind</span>
                        {item.sources.length > 0 ? (
                          <span className="rounded bg-panel px-2 py-1 normal-case text-zinc-600">
                            {item.sources.length} sources
                          </span>
                        ) : null}
                      </div>
                      <p className="whitespace-pre-wrap leading-7">{item.answer}</p>

                      {item.sources.length > 0 ? (
                        <details className="mt-4 rounded-md border border-line bg-panel">
                          <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-zinc-700">
                            Source references
                          </summary>
                          <div className="grid gap-2 border-t border-line p-3">
                            {item.sources.map((source, index) => (
                              <details
                                key={`${item.id}:${source.file_path}:${source.start_line}`}
                                className="rounded-md border border-line bg-white"
                              >
                                <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-zinc-700">
                                  <span className="mr-2 rounded bg-panel px-1.5 py-0.5 text-[11px] text-zinc-500">
                                    {index + 1}
                                  </span>
                                  <span className="break-all">
                                    {source.file_path}:{source.start_line}-{source.end_line}
                                  </span>
                                </summary>
                                <pre className="max-h-72 overflow-auto whitespace-pre-wrap border-t border-line bg-zinc-950 p-3 text-xs leading-5 text-zinc-100">
                                  <code>{source.content}</code>
                                </pre>
                              </details>
                            ))}
                          </div>
                        </details>
                      ) : null}
                    </div>
                  </article>
                ))}
                {pendingQuestion ? (
                  <article className="space-y-3">
                    <div className="ml-auto max-w-full rounded-md bg-ink px-4 py-3 text-white sm:max-w-[78%]">
                      <div className="mb-1 text-xs font-medium text-zinc-300">You just now</div>
                      <p className="whitespace-pre-wrap leading-6">{pendingQuestion}</p>
                    </div>
                    <div className="max-w-full rounded-md border border-line bg-white px-4 py-3 sm:max-w-[88%]">
                      <div className="mb-2 text-xs font-semibold uppercase text-zinc-500">
                        RepoMind
                      </div>
                      <div className="flex items-center gap-2 text-sm text-zinc-600">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
                        Thinking through the repo context...
                      </div>
                    </div>
                  </article>
                ) : null}
                <div ref={messagesEndRef} />
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-center">
                <div className="max-w-sm rounded-md border border-dashed border-line bg-panel px-5 py-6">
                  <p className="text-sm font-medium text-ink">
                    {selectedProject
                      ? selectedChat
                        ? "This chat is ready."
                        : "No chat selected."
                      : "No project selected."}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-zinc-500">
                    {selectedProject
                      ? selectedChat
                        ? "Ask a focused question and RepoMind will answer with source references."
                        : "Create a chat or ask a question to start one."
                      : "Import or select a repo to start chatting."}
                  </p>
                </div>
              </div>
            )}
          </div>

          <form className="flex flex-col gap-3 border-t border-line pt-4 sm:flex-row" onSubmit={handleChat}>
            <textarea
              className="min-h-20 flex-1 resize-none rounded-md border border-line px-3 py-2 outline-none focus:border-accent"
              placeholder={selectedProject ? "Ask about the selected repo..." : "Select a project first"}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              required
            />
            <button
              className="h-12 rounded-md bg-ink px-5 text-sm font-medium text-white disabled:opacity-60 sm:h-20"
              disabled={busy || !selectedProjectId}
            >
              {pendingAction === "ask" ? "Thinking..." : "Ask"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
