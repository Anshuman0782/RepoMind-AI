"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  CodeSearchResult,
  ChatSession,
  ChatMessageResponse,
  ChatResponse,
  EditChangeSet,
  FileEditOperation,
  FileContent,
  FileEntry,
  Project,
  applyEditChangeSet,
  createChangePlan,
  createChatSession,
  createEditChangeSet,
  createProject,
  deleteChatSession,
  deleteProject,
  getProjectGitDiff,
  investigateCodebase,
  listChatMessages,
  listChatSessions,
  listProjectFiles,
  listProjects,
  readProjectFile,
  rejectEditChangeSet,
  renameChatSession,
  rollbackEditChangeSet,
  searchProjectCode,
  sendMessage,
} from "@/lib/api";

import { Copy, Send } from "lucide-react";

type ChatMessage = {
  id: string;
  question: string;
  answer: string;
  sources: ChatResponse["sources"];
  createdAt: string;
};

type AnswerPart =
  | {
      type: "text";
      content: string;
    }
  | {
      type: "code";
      language: string;
      content: string;
    };

function parseAnswer(answer: string): AnswerPart[] {
  const parts: AnswerPart[] = [];
  const codeBlockPattern = /```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockPattern.exec(answer)) !== null) {
    const textBefore = answer.slice(lastIndex, match.index);
    if (textBefore.trim()) {
      parts.push({ type: "text", content: textBefore.trim() });
    }
    parts.push({
      type: "code",
      language: match[1]?.trim() || "code",
      content: match[2].replace(/\n$/, ""),
    });
    lastIndex = match.index + match[0].length;
  }

  const remainingText = answer.slice(lastIndex);
  if (remainingText.trim()) {
    parts.push({ type: "text", content: remainingText.trim() });
  }

  return parts.length > 0 ? parts : [{ type: "text", content: answer }];
}

function renderInlineText(text: string) {
  const tokens = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return tokens.map((token, index) => {
    if (token.startsWith("`") && token.endsWith("`")) {
      return (
        <code key={`${token}:${index}`} className="rounded bg-panel px-1 py-0.5 text-[0.92em] text-ink">
          {token.slice(1, -1)}
        </code>
      );
    }
    if (token.startsWith("**") && token.endsWith("**")) {
      return (
        <strong key={`${token}:${index}`} className="font-semibold text-ink">
          {token.slice(2, -2)}
        </strong>
      );
    }
    return token;
  });
}

function AnswerContent({ answer }: { answer: string }) {
  const parts = parseAnswer(answer);

  async function copyCode(content: string) {
    await navigator.clipboard.writeText(content);
  }

  return (
    <div className="space-y-3 leading-6 sm:leading-7">
      {parts.map((part, index) => {
        if (part.type === "code") {
          return (
            <div
              key={`code:${index}`}
              className="overflow-hidden rounded-md border border-zinc-800 bg-zinc-950 text-zinc-100"
            >
              <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-300">
                <span>{part.language}</span>
                <button
                  type="button"
                  className="rounded p-1 text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
                  onClick={() => copyCode(part.content)}
                  aria-label="Copy code"
                  title="Copy code"
                >
                  <Copy size={16} />
                </button>
              </div>
              <pre className="max-h-96 overflow-auto p-3 text-xs leading-5">
                <code>{part.content}</code>
              </pre>
            </div>
          );
        }

        return part.content.split(/\n{2,}/).map((paragraph, paragraphIndex) => (
          <p key={`text:${index}:${paragraphIndex}`} className="whitespace-pre-wrap">
            {renderInlineText(paragraph)}
          </p>
        ));
      })}
    </div>
  );
}

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

function formatBytes(value: number): string {
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
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
  const [workspaceMode, setWorkspaceMode] = useState<"chat" | "files" | "navigator" | "planner" | "editor">("chat");
  const [investigationMode, setInvestigationMode] = useState<"navigator" | "bug">("navigator");
  const [investigationPrompt, setInvestigationPrompt] = useState("");
  const [plannerPrompt, setPlannerPrompt] = useState("");
  const [editAction, setEditAction] = useState<FileEditOperation["action"]>("edit");
  const [editFilePath, setEditFilePath] = useState("");
  const [editContent, setEditContent] = useState("");
  const [activeEditChangeSet, setActiveEditChangeSet] = useState<EditChangeSet | null>(null);
  const [filesByProject, setFilesByProject] = useState<Record<string, FileEntry[]>>({});
  const [selectedFilePath, setSelectedFilePath] = useState("");
  const [fileContentsByKey, setFileContentsByKey] = useState<Record<string, FileContent>>({});
  const [fileFilter, setFileFilter] = useState("");
  const [codeSearch, setCodeSearch] = useState("");
  const [searchResults, setSearchResults] = useState<CodeSearchResult[]>([]);
  const [gitDiff, setGitDiff] = useState("");
  const [editingChatId, setEditingChatId] = useState("");
  const [editingTitle, setEditingTitle] = useState("");
  const [pendingAction, setPendingAction] = useState("");
  const [pendingQuestion, setPendingQuestion] = useState("");
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingChatsProjectId, setLoadingChatsProjectId] = useState("");
  const [loadingMessagesChatId, setLoadingMessagesChatId] = useState("");
  const [loadingFilesProjectId, setLoadingFilesProjectId] = useState("");
  const [loadingFilePath, setLoadingFilePath] = useState("");
  const [loadingEditFilePath, setLoadingEditFilePath] = useState("");
  const [error, setError] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selectedProject = projects.find((project) => project.id === selectedProjectId);
  const projectChats = selectedProjectId ? chatsByProject[selectedProjectId] ?? [] : [];
  const selectedChat = projectChats.find((chat) => chat.id === selectedChatId);
  const currentMessages = selectedChatId ? messagesByChat[selectedChatId] ?? [] : [];
  const projectFiles = selectedProjectId ? filesByProject[selectedProjectId] ?? [] : [];
  const selectedFileKey = selectedProjectId && selectedFilePath ? `${selectedProjectId}:${selectedFilePath}` : "";
  const selectedFileContent = selectedFileKey ? fileContentsByKey[selectedFileKey] : undefined;
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
  const filteredFiles = projectFiles.filter((file) => {
    const term = fileFilter.trim().toLowerCase();
    return !term || file.path.toLowerCase().includes(term);
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
    if (!selectedProjectId || filesByProject[selectedProjectId]) {
      return;
    }

    setLoadingFilesProjectId(selectedProjectId);
    listProjectFiles(selectedProjectId)
      .then((items) => {
        setFilesByProject((current) => ({
          ...current,
          [selectedProjectId]: items,
        }));
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load files");
      })
      .finally(() => {
        setLoadingFilesProjectId("");
      });
  }, [filesByProject, selectedProjectId]);

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
      setSelectedFilePath("");
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

  async function handleDeleteProject(projectId: string) {
    const project = projects.find((item) => item.id === projectId);
    const confirmed = window.confirm(
      `Delete ${project?.name ?? "this project"} and all of its chats from the database?`,
    );
    if (!confirmed) {
      return;
    }

    setPendingAction("delete-project");
    setError("");
    try {
      await deleteProject(projectId);
      const deletedChatIds = (chatsByProject[projectId] ?? []).map((chat) => chat.id);
      const remainingProjects = projects.filter((item) => item.id !== projectId);

      setProjects(remainingProjects);
      setChatsByProject((current) => {
        const next = { ...current };
        delete next[projectId];
        return next;
      });
      setFilesByProject((current) => {
        const next = { ...current };
        delete next[projectId];
        return next;
      });
      setMessagesByChat((current) => {
        const next = { ...current };
        for (const chatId of deletedChatIds) {
          delete next[chatId];
        }
        return next;
      });

      if (selectedProjectId === projectId) {
        const nextProject = remainingProjects[0];
        setSelectedProjectId(nextProject?.id ?? "");
        setSelectedChatId(nextProject ? chatsByProject[nextProject.id]?.[0]?.id ?? "" : "");
        setSelectedFilePath("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete project");
    } finally {
      setPendingAction("");
    }
  }

  async function handleOpenFile(path: string) {
    if (!selectedProjectId) {
      return;
    }

    setSelectedFilePath(path);
    setWorkspaceMode("files");
    setError("");
    const fileKey = `${selectedProjectId}:${path}`;
    if (fileContentsByKey[fileKey]) {
      return;
    }

    setLoadingFilePath(path);
    try {
      const content = await readProjectFile(selectedProjectId, path);
      setFileContentsByKey((current) => ({
        ...current,
        [fileKey]: content,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read file");
    } finally {
      setLoadingFilePath("");
    }
  }

  async function handleSearchCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProjectId || !codeSearch.trim()) {
      return;
    }

    setPendingAction("search-code");
    setError("");
    setGitDiff("");
    try {
      const results = await searchProjectCode(selectedProjectId, codeSearch);
      setSearchResults(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to search code");
    } finally {
      setPendingAction("");
    }
  }

  async function handleReadGitDiff() {
    if (!selectedProjectId) {
      return;
    }

    setPendingAction("git-diff");
    setError("");
    setSearchResults([]);
    try {
      const diff = await getProjectGitDiff(selectedProjectId);
      setGitDiff(diff || "No uncommitted changes.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read git diff");
    } finally {
      setPendingAction("");
    }
  }

  function clearCachedFile(path: string) {
    if (!selectedProjectId) {
      return;
    }
    const fileKey = `${selectedProjectId}:${path}`;
    setFileContentsByKey((current) => {
      const next = { ...current };
      delete next[fileKey];
      return next;
    });
    setFilesByProject((current) => {
      const next = { ...current };
      delete next[selectedProjectId];
      return next;
    });
  }

  async function loadEditorFileContent(path = editFilePath, forceEdit = false) {
    if (!selectedProjectId || (!forceEdit && editAction !== "edit")) {
      return;
    }

    const trimmedPath = path.trim();
    if (!trimmedPath) {
      return;
    }

    setLoadingEditFilePath(trimmedPath);
    setError("");
    try {
      const fileKey = `${selectedProjectId}:${trimmedPath}`;
      const cachedContent = fileContentsByKey[fileKey];
      if (cachedContent) {
        setEditContent(cachedContent.content);
        return;
      }

      const content = await readProjectFile(selectedProjectId, trimmedPath);
      setEditContent(content.content);
      setFileContentsByKey((current) => ({
        ...current,
        [fileKey]: content,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load file content");
    } finally {
      setLoadingEditFilePath("");
    }
  }

  async function handleCreateEditPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProjectId) {
      setError("Create or select a project first.");
      return;
    }

    const path = editFilePath.trim();
    if (!path) {
      setError("Choose a file path before creating a preview.");
      return;
    }

    const operation: FileEditOperation =
      editAction === "delete"
        ? { action: editAction, path }
        : { action: editAction, path, content: editContent };

    setPendingAction("edit-preview");
    setError("");
    setActiveEditChangeSet(null);
    try {
      const changeSet = await createEditChangeSet(selectedProjectId, [operation]);
      setActiveEditChangeSet(changeSet);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create edit preview");
    } finally {
      setPendingAction("");
    }
  }

  async function handleApplyEditChangeSet() {
    if (!selectedProjectId || !activeEditChangeSet) {
      return;
    }

    setPendingAction("edit-apply");
    setError("");
    try {
      const updated = await applyEditChangeSet(selectedProjectId, activeEditChangeSet.id);
      setActiveEditChangeSet(updated);
      updated.files.forEach(clearCachedFile);
      const diff = await getProjectGitDiff(selectedProjectId);
      setGitDiff(diff || "No uncommitted changes.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply edit");
    } finally {
      setPendingAction("");
    }
  }

  async function handleRejectEditChangeSet() {
    if (!selectedProjectId || !activeEditChangeSet) {
      return;
    }

    setPendingAction("edit-reject");
    setError("");
    try {
      const updated = await rejectEditChangeSet(selectedProjectId, activeEditChangeSet.id);
      setActiveEditChangeSet(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reject edit");
    } finally {
      setPendingAction("");
    }
  }

  async function handleRollbackEditChangeSet() {
    if (!selectedProjectId || !activeEditChangeSet) {
      return;
    }

    setPendingAction("edit-rollback");
    setError("");
    try {
      const updated = await rollbackEditChangeSet(selectedProjectId, activeEditChangeSet.id);
      setActiveEditChangeSet(updated);
      updated.files.forEach(clearCachedFile);
      const diff = await getProjectGitDiff(selectedProjectId);
      setGitDiff(diff || "No uncommitted changes.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rollback edit");
    } finally {
      setPendingAction("");
    }
  }

  async function handleInvestigation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProjectId) {
      setError("Create or select a project first.");
      return;
    }

    const submittedPrompt = investigationPrompt.trim();
    if (!submittedPrompt) {
      return;
    }

    setPendingAction("investigate");
    setPendingQuestion(submittedPrompt);
    setError("");
    setInvestigationPrompt("");
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
      const response = await investigateCodebase(
        selectedProjectId,
        activeChatId,
        submittedPrompt,
        investigationMode,
      );
      const prefix = investigationMode === "bug" ? "Bug investigation" : "Repo navigator";
      const chatMessage: ChatMessage = {
        id: crypto.randomUUID(),
        question: `${prefix}: ${submittedPrompt}`,
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
                  title: titleFromQuestion(submittedPrompt),
                  updated_at: new Date().toISOString(),
                }
              : chat,
          ),
        }));
      }
      setWorkspaceMode("chat");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to investigate codebase");
      setInvestigationPrompt(submittedPrompt);
    } finally {
      setPendingAction("");
      setPendingQuestion("");
    }
  }

  async function handleChangePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProjectId) {
      setError("Create or select a project first.");
      return;
    }

    const submittedPrompt = plannerPrompt.trim();
    if (!submittedPrompt) {
      return;
    }

    setPendingAction("plan-change");
    setPendingQuestion(submittedPrompt);
    setError("");
    setPlannerPrompt("");
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
      const response = await createChangePlan(selectedProjectId, activeChatId, submittedPrompt);
      const chatMessage: ChatMessage = {
        id: crypto.randomUUID(),
        question: `Change planner: ${submittedPrompt}`,
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
                  title: titleFromQuestion(submittedPrompt),
                  updated_at: new Date().toISOString(),
                }
              : chat,
          ),
        }));
      }
      setWorkspaceMode("chat");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create change plan");
      setPlannerPrompt(submittedPrompt);
    } finally {
      setPendingAction("");
      setPendingQuestion("");
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
        <aside className="flex min-h-0 flex-col border-b border-line bg-panel p-3 sm:p-6 lg:border-b-0 lg:border-r">
          <h1 className="text-xl font-semibold leading-tight sm:text-2xl">RepoMind AI</h1>
          <p className="mt-1 text-xs leading-5 text-zinc-600 sm:mt-2 sm:text-sm sm:leading-6">
            Import a public GitHub repo, index it, and ask grounded questions about the code.
          </p>

          <form className="mt-4 space-y-2 sm:mt-8 sm:space-y-3" onSubmit={handleCreateProject}>
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

          <div className="mt-5 sm:mt-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Projects</h2>
            <input
              className="mt-3 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent"
              placeholder="Search projects"
              value={projectSearch}
              onChange={(event) => setProjectSearch(event.target.value)}
            />
            <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1 sm:max-h-80 lg:max-h-[calc(100vh-390px)]">
              {loadingProjects ? (
                <div className="space-y-2">
                  <div className="h-16 animate-pulse rounded-md bg-white" />
                  <div className="h-16 animate-pulse rounded-md bg-white" />
                </div>
              ) : null}
              {filteredProjects.map((project) => (
                <div key={project.id} className="space-y-1">
                  <div
                    className={`group/project relative rounded-md border p-2 text-sm transition ${
                      selectedProjectId === project.id
                        ? "border-accent bg-white shadow-sm"
                        : "border-line bg-transparent hover:border-zinc-400 hover:bg-white"
                    }`}
                  >
                    <button
                      type="button"
                      className="min-w-0 w-full pr-14 text-left"
                      onClick={() => {
                        setSelectedProjectId(project.id);
                        setSelectedChatId(chatsByProject[project.id]?.[0]?.id ?? "");
                        setSelectedFilePath("");
                        setSearchResults([]);
                        setGitDiff("");
                        setActiveEditChangeSet(null);
                        setError("");
                      }}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium">{project.name}</span>
                        <span className="rounded bg-panel px-1.5 py-0.5 text-[10px] uppercase text-zinc-500">
                          {project.status}
                        </span>
                      </span>
                      <span className="block truncate text-xs text-zinc-500">{project.repo_url}</span>
                    </button>
                    <button
                      type="button"
                      className="absolute right-2 top-2 rounded-md px-2 py-1 text-xs text-red-500 opacity-0 transition hover:bg-red-50 group-hover/project:opacity-100 group-focus-within/project:opacity-100 disabled:opacity-40"
                      onClick={() => handleDeleteProject(project.id)}
                      disabled={busy}
                      title="Delete project"
                    >
                      {pendingAction === "delete-project" ? "..." : "Delete"}
                    </button>
                  </div>
                  {selectedProjectId === project.id ? (
                    <div className="space-y-1 pl-0 sm:pl-3">
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
                        <div key={chat.id} className="group flex flex-wrap items-center gap-1 sm:flex-nowrap">
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
                                className={`min-w-0 basis-full truncate rounded-md px-3 py-2 text-left text-xs transition sm:basis-auto ${
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
                                className="rounded-md px-2 py-1 text-xs text-zinc-500 opacity-100 hover:bg-white hover:text-ink lg:opacity-0 lg:group-hover:opacity-100"
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
                                className="rounded-md px-2 py-1 text-xs text-red-500 opacity-100 hover:bg-red-50 lg:opacity-0 lg:group-hover:opacity-100"
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

        <section className="flex min-h-[520px] flex-col p-3 sm:p-6 lg:min-h-0">
          <div className="border-b border-line pb-4 sm:pb-5">
            <h2 className="break-words text-lg font-semibold sm:text-xl">{selectedChat?.title ?? "Codebase Chat"}</h2>
            {selectedProject ? (
              <div className="mt-1 flex flex-col gap-2 text-xs text-zinc-600 sm:flex-row sm:items-center sm:justify-between sm:text-sm">
                <p className="min-w-0 truncate">
                  Selected: <span className="font-medium text-ink">{selectedProject.name}</span>{" "}
                  <span className="hidden text-zinc-400 sm:inline">/</span>{" "}
                  <span className="hidden sm:inline">{selectedProject.repo_url}</span>
                </p>
              </div>
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

          <div className="mt-4 flex w-full rounded-md border border-line bg-panel p-1 text-sm">
            <button
              type="button"
              className={`flex-1 rounded px-3 py-2 font-medium transition ${
                workspaceMode === "chat" ? "bg-white text-ink shadow-sm" : "text-zinc-600 hover:text-ink"
              }`}
              onClick={() => setWorkspaceMode("chat")}
            >
              Chat
            </button>
            <button
              type="button"
              className={`flex-1 rounded px-3 py-2 font-medium transition ${
                workspaceMode === "files" ? "bg-white text-ink shadow-sm" : "text-zinc-600 hover:text-ink"
              }`}
              onClick={() => setWorkspaceMode("files")}
              disabled={!selectedProjectId}
            >
              Files
            </button>
            <button
              type="button"
              className={`flex-1 rounded px-3 py-2 font-medium transition ${
                workspaceMode === "navigator" ? "bg-white text-ink shadow-sm" : "text-zinc-600 hover:text-ink"
              }`}
              onClick={() => setWorkspaceMode("navigator")}
              disabled={!selectedProjectId}
            >
              Navigator
            </button>
            <button
              type="button"
              className={`flex-1 rounded px-3 py-2 font-medium transition ${
                workspaceMode === "planner" ? "bg-white text-ink shadow-sm" : "text-zinc-600 hover:text-ink"
              }`}
              onClick={() => setWorkspaceMode("planner")}
              disabled={!selectedProjectId}
            >
              Planner
            </button>
            <button
              type="button"
              className={`flex-1 rounded px-3 py-2 font-medium transition ${
                workspaceMode === "editor" ? "bg-white text-ink shadow-sm" : "text-zinc-600 hover:text-ink"
              }`}
              onClick={() => setWorkspaceMode("editor")}
              disabled={!selectedProjectId}
            >
              Editor
            </button>
          </div>

          {workspaceMode === "chat" ? (
            <>
          <div className="min-h-0 flex-1 overflow-y-auto py-4 pr-1 sm:py-6">
            {isLoadingMessages ? (
              <div className="space-y-6">
                <div className="ml-auto h-20 max-w-[78%] animate-pulse rounded-md bg-zinc-200" />
                <div className="h-32 max-w-[88%] animate-pulse rounded-md border border-line bg-white" />
              </div>
            ) : currentMessages.length > 0 || pendingQuestion ? (
              <div className="space-y-6">
                {currentMessages.map((item) => (
                  <article key={item.id} className="space-y-3">
                    <div className="ml-auto max-w-full rounded-md bg-ink px-3 py-2.5 text-sm text-white sm:max-w-[78%] sm:px-4 sm:py-3 sm:text-base">
                      <div className="mb-1 text-xs font-medium text-zinc-300">You at {item.createdAt}</div>
                      <p className="whitespace-pre-wrap leading-6">{item.question}</p>
                    </div>

                    <div className="max-w-full rounded-md border border-line bg-white px-3 py-2.5 text-sm sm:max-w-[88%] sm:px-4 sm:py-3 sm:text-base">
                      <div className="mb-2 flex items-center justify-between gap-3 text-xs font-semibold uppercase text-zinc-500">
                        <span>RepoMind</span>
                        {item.sources.length > 0 ? (
                          <span className="rounded bg-panel px-2 py-1 normal-case text-zinc-600">
                            {item.sources.length} sources
                          </span>
                        ) : null}
                      </div>
                      <AnswerContent answer={item.answer} />

                      {item.sources.length > 0 ? (
                        <details className="mt-4 rounded-md border border-line bg-panel">
                          <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-zinc-700">
                            Source references
                          </summary>
                          <div className="grid gap-2 border-t border-line p-2 sm:p-3">
                            {item.sources.map((source, index) => (
                              <details
                                key={`${item.id}:${source.file_path}:${source.start_line}:${source.end_line}:${index}`}
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
                                <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words border-t border-line bg-zinc-950 p-3 text-xs leading-5 text-zinc-100">
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
                    <div className="ml-auto max-w-full rounded-md bg-ink px-3 py-2.5 text-sm text-white sm:max-w-[78%] sm:px-4 sm:py-3 sm:text-base">
                      <div className="mb-1 text-xs font-medium text-zinc-300">You just now</div>
                      <p className="whitespace-pre-wrap leading-6">{pendingQuestion}</p>
                    </div>
                    <div className="max-w-full rounded-md border border-line bg-white px-3 py-2.5 text-sm sm:max-w-[88%] sm:px-4 sm:py-3">
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

          <form className="flex flex-col gap-2 border-t border-line pt-3 sm:flex-row sm:gap-3 sm:pt-4" onSubmit={handleChat}>
            <textarea
              className="min-h-16 flex-1 resize-none rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent sm:min-h-20 sm:text-base"
              placeholder={selectedProject ? "Ask about the selected repo..." : "Select a project first"}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              required
            />
            {/* <button
              className="h-12 rounded-md bg-ink px-5 text-sm font-medium text-white disabled:opacity-60 sm:h-20"
              disabled={busy || !selectedProjectId}
            >
              {pendingAction === "ask" ? "Thinking..." : "Ask"}
            </button> */}

            <button
  className="h-12 rounded-md bg-ink px-5 text-sm font-medium text-white disabled:opacity-60 sm:h-20 flex items-center gap-2 transition-all duration-150 active:scale-[0.97]"
  disabled={busy || !selectedProjectId}
  type="submit"
>
  {pendingAction === "ask" ? (
    <>
      <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      Thinking...
    </>
  ) : (
    <>
      <Send size={25} />
      
    </>
  )}
</button>
          </form>
            </>
          ) : workspaceMode === "files" ? (
            <div className="grid min-h-0 flex-1 gap-4 py-4 lg:grid-cols-[320px_1fr]">
              <div className="flex min-h-0 flex-col rounded-md border border-line bg-panel">
                <div className="border-b border-line p-3">
                  <input
                    className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent"
                    placeholder="Filter files"
                    value={fileFilter}
                    onChange={(event) => setFileFilter(event.target.value)}
                    disabled={!selectedProjectId}
                  />
                  <p className="mt-2 text-xs text-zinc-500">
                    {loadingFilesProjectId === selectedProjectId
                      ? "Loading files..."
                      : `${filteredFiles.length} files`}
                  </p>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-2">
                  {filteredFiles.map((file) => (
                    <button
                      key={file.path}
                      type="button"
                      className={`mb-1 w-full rounded-md px-2 py-2 text-left text-xs transition ${
                        selectedFilePath === file.path
                          ? "bg-ink text-white"
                          : "bg-white text-zinc-700 hover:bg-zinc-100"
                      }`}
                      onClick={() => handleOpenFile(file.path)}
                    >
                      <span className="block truncate font-medium">{file.path}</span>
                      <span className={selectedFilePath === file.path ? "text-zinc-300" : "text-zinc-500"}>
                        {formatBytes(file.size)}
                      </span>
                    </button>
                  ))}
                  {!selectedProject ? (
                    <p className="p-3 text-sm text-zinc-500">Select a project to browse files.</p>
                  ) : null}
                  {selectedProject && !loadingFilesProjectId && filteredFiles.length === 0 ? (
                    <p className="p-3 text-sm text-zinc-500">No matching files.</p>
                  ) : null}
                </div>
              </div>

              <div className="flex min-h-0 flex-col gap-4">
                <div className="rounded-md border border-line bg-white p-3">
                  <form className="flex flex-col gap-2 sm:flex-row" onSubmit={handleSearchCode}>
                    <input
                      className="min-w-0 flex-1 rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent"
                      placeholder="Search code"
                      value={codeSearch}
                      onChange={(event) => setCodeSearch(event.target.value)}
                      disabled={!selectedProjectId}
                    />
                    <button
                      className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                      disabled={busy || !selectedProjectId}
                    >
                      {pendingAction === "search-code" ? "Searching..." : "Search"}
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-panel disabled:opacity-60"
                      onClick={handleReadGitDiff}
                      disabled={busy || !selectedProjectId}
                    >
                      {pendingAction === "git-diff" ? "Loading..." : "Git diff"}
                    </button>
                  </form>
                  {searchResults.length > 0 ? (
                    <div className="mt-3 max-h-44 overflow-y-auto rounded-md border border-line">
                      {searchResults.map((result) => (
                        <button
                          key={`${result.file_path}:${result.line_number}:${result.line}`}
                          type="button"
                          className="block w-full border-b border-line px-3 py-2 text-left text-xs last:border-b-0 hover:bg-panel"
                          onClick={() => handleOpenFile(result.file_path)}
                        >
                          <span className="font-medium text-ink">
                            {result.file_path}:{result.line_number}
                          </span>
                          <span className="mt-1 block truncate text-zinc-600">{result.line}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {gitDiff ? (
                    <pre className="mt-3 max-h-44 overflow-auto rounded-md bg-zinc-950 p-3 text-xs leading-5 text-zinc-100">
                      <code>{gitDiff}</code>
                    </pre>
                  ) : null}
                </div>

                <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-line bg-white">
                  {loadingFilePath === selectedFilePath ? (
                    <div className="p-4 text-sm text-zinc-500">Loading file...</div>
                  ) : selectedFileContent ? (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
                        <h3 className="min-w-0 truncate text-sm font-semibold">{selectedFileContent.path}</h3>
                        <span className="text-xs text-zinc-500">
                          {selectedFileContent.line_count} lines / {formatBytes(selectedFileContent.size)}
                        </span>
                      </div>
                      <pre className="h-full max-h-[calc(100vh-330px)] overflow-auto bg-zinc-950 p-4 text-xs leading-5 text-zinc-100">
                        <code>{selectedFileContent.content}</code>
                      </pre>
                    </>
                  ) : (
                    <div className="flex h-full min-h-72 items-center justify-center text-center">
                      <div className="max-w-sm px-5">
                        <p className="text-sm font-medium text-ink">File explorer ready.</p>
                        <p className="mt-2 text-sm leading-6 text-zinc-500">
                          Pick a file, search the codebase, or inspect the current git diff.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : workspaceMode === "navigator" ? (
            <div className="min-h-0 flex-1 overflow-y-auto py-4">
              <div className="mx-auto max-w-3xl rounded-md border border-line bg-white p-4 sm:p-5">
                <div className="flex rounded-md border border-line bg-panel p-1 text-sm">
                  <button
                    type="button"
                    className={`flex-1 rounded px-3 py-2 font-medium transition ${
                      investigationMode === "navigator"
                        ? "bg-white text-ink shadow-sm"
                        : "text-zinc-600 hover:text-ink"
                    }`}
                    onClick={() => setInvestigationMode("navigator")}
                  >
                    Find area
                  </button>
                  <button
                    type="button"
                    className={`flex-1 rounded px-3 py-2 font-medium transition ${
                      investigationMode === "bug"
                        ? "bg-white text-ink shadow-sm"
                        : "text-zinc-600 hover:text-ink"
                    }`}
                    onClick={() => setInvestigationMode("bug")}
                  >
                    Investigate bug
                  </button>
                </div>

                <form className="mt-4 space-y-3" onSubmit={handleInvestigation}>
                  <textarea
                    className="min-h-36 w-full resize-none rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent"
                    placeholder={
                      investigationMode === "bug"
                        ? "Describe the bug, error text, failing behavior, or screen involved..."
                        : "Ask where a feature, route, symbol, or behavior is handled..."
                    }
                    value={investigationPrompt}
                    onChange={(event) => setInvestigationPrompt(event.target.value)}
                    disabled={!selectedProjectId || busy}
                    required
                  />
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs leading-5 text-zinc-500">
                      Results are saved into the selected chat with source references.
                    </p>
                    <button
                      className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                      disabled={busy || !selectedProjectId}
                    >
                      {pendingAction === "investigate" ? "Investigating..." : "Run navigator"}
                    </button>
                  </div>
                </form>

                {currentMessages.length > 0 ? (
                  <div className="mt-5 rounded-md border border-line bg-panel p-3 text-sm text-zinc-600">
                    Latest saved result:{" "}
                    <span className="font-medium text-ink">
                      {currentMessages[currentMessages.length - 1].question}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          ) : workspaceMode === "editor" ? (
            <div className="min-h-0 flex-1 overflow-y-auto py-4">
              <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <form className="rounded-md border border-line bg-white p-4 sm:p-5" onSubmit={handleCreateEditPreview}>
                  <div className="grid gap-3">
                    <div>
                      <label className="text-xs font-semibold uppercase text-zinc-500">Action</label>
                      <div className="mt-2 grid grid-cols-3 rounded-md border border-line bg-panel p-1 text-sm">
                        {(["edit", "create", "delete"] as const).map((action) => (
                          <button
                            key={action}
                            type="button"
                            className={`rounded px-3 py-2 font-medium capitalize transition ${
                              editAction === action ? "bg-white text-ink shadow-sm" : "text-zinc-600 hover:text-ink"
                            }`}
                            onClick={() => {
                              setEditAction(action);
                              setActiveEditChangeSet(null);
                              if (action === "create") {
                                setEditContent("");
                              }
                              if (action === "edit") {
                                void loadEditorFileContent(editFilePath, true);
                              }
                            }}
                          >
                            {action}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-semibold uppercase text-zinc-500" htmlFor="edit-file-path">
                        File path
                      </label>
                      <input
                        id="edit-file-path"
                        className="mt-2 w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent"
                        placeholder="src/example.ts"
                        value={editFilePath}
                        onChange={(event) => {
                          setEditFilePath(event.target.value);
                          setActiveEditChangeSet(null);
                        }}
                        onBlur={() => {
                          void loadEditorFileContent();
                        }}
                        disabled={!selectedProjectId || busy}
                        required
                      />
                    </div>

                    {editAction !== "delete" ? (
                      <div>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <label className="text-xs font-semibold uppercase text-zinc-500" htmlFor="edit-content">
                            Full file content
                          </label>
                          {editAction === "edit" ? (
                            <button
                              type="button"
                              className="rounded-md border border-line px-2 py-1 text-xs font-medium text-ink hover:bg-panel disabled:opacity-60"
                              onClick={() => {
                                void loadEditorFileContent();
                              }}
                              disabled={!selectedProjectId || busy || !editFilePath.trim()}
                            >
                              {loadingEditFilePath ? "Loading..." : "Load current file"}
                            </button>
                          ) : null}
                        </div>
                        <textarea
                          id="edit-content"
                          className="mt-2 min-h-80 w-full resize-y rounded-md border border-line px-3 py-2 font-mono text-xs leading-5 outline-none focus:border-accent"
                          placeholder={
                            editAction === "edit"
                              ? "Enter a file path above to load the current file..."
                              : "Paste or write the complete file content to preview..."
                          }
                          value={editContent}
                          onChange={(event) => setEditContent(event.target.value)}
                          disabled={!selectedProjectId || busy || Boolean(loadingEditFilePath)}
                          required
                        />
                      </div>
                    ) : null}

                    <button
                      className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                      disabled={busy || !selectedProjectId}
                    >
                      {pendingAction === "edit-preview" ? "Creating preview..." : "Preview diff"}
                    </button>
                  </div>
                </form>

                <div className="rounded-md border border-line bg-white p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-ink">Change set</h3>
                      <p className="mt-1 text-xs text-zinc-500">
                        Preview first, then apply only after approval.
                      </p>
                    </div>
                    {activeEditChangeSet ? (
                      <span className="rounded bg-panel px-2 py-1 text-xs font-medium uppercase text-zinc-600">
                        {activeEditChangeSet.status.replace("_", " ")}
                      </span>
                    ) : null}
                  </div>

                  {activeEditChangeSet ? (
                    <div className="mt-4 space-y-3">
                      <div className="rounded-md border border-line bg-panel p-3">
                        <p className="text-xs font-semibold uppercase text-zinc-500">Proposed files</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {activeEditChangeSet.files.map((file) => (
                            <span key={file} className="rounded bg-white px-2 py-1 text-xs text-zinc-700">
                              {file}
                            </span>
                          ))}
                        </div>
                      </div>

                      <pre className="max-h-[420px] overflow-auto rounded-md bg-zinc-950 p-3 text-xs leading-5 text-zinc-100">
                        <code>{activeEditChangeSet.diff || "No diff available."}</code>
                      </pre>

                      <div className="flex flex-col gap-2 sm:flex-row">
                        {activeEditChangeSet.status === "pending" ? (
                          <>
                            <button
                              type="button"
                              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                              onClick={handleApplyEditChangeSet}
                              disabled={busy}
                            >
                              {pendingAction === "edit-apply" ? "Applying..." : "Apply approved edit"}
                            </button>
                            <button
                              type="button"
                              className="rounded-md border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-panel disabled:opacity-60"
                              onClick={handleRejectEditChangeSet}
                              disabled={busy}
                            >
                              {pendingAction === "edit-reject" ? "Rejecting..." : "Reject"}
                            </button>
                          </>
                        ) : null}
                        {activeEditChangeSet.status === "applied" ? (
                          <button
                            type="button"
                            className="rounded-md border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
                            onClick={handleRollbackEditChangeSet}
                            disabled={busy}
                          >
                            {pendingAction === "edit-rollback" ? "Rolling back..." : "Rollback change set"}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-md border border-dashed border-line bg-panel p-5 text-sm leading-6 text-zinc-600">
                      Create a preview to see the exact paths and diff before any local file is touched.
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto py-4">
              <div className="mx-auto max-w-3xl rounded-md border border-line bg-white p-4 sm:p-5">
                <form className="space-y-3" onSubmit={handleChangePlan}>
                  <textarea
                    className="min-h-36 w-full resize-none rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent"
                    placeholder="Describe the feature, fix, refactor, or file change you want planned..."
                    value={plannerPrompt}
                    onChange={(event) => setPlannerPrompt(event.target.value)}
                    disabled={!selectedProjectId || busy}
                    required
                  />
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs leading-5 text-zinc-500">
                      Plans are saved into chat. File edits stay locked behind approval.
                    </p>
                    <button
                      className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                      disabled={busy || !selectedProjectId}
                    >
                      {pendingAction === "plan-change" ? "Planning..." : "Create plan"}
                    </button>
                  </div>
                </form>

                <div className="mt-5 rounded-md border border-line bg-panel p-3 text-sm text-zinc-600">
                  Approval gate: RepoMind will only propose files, risks, and tests in this goal.
                </div>

                {currentMessages.length > 0 ? (
                  <div className="mt-3 rounded-md border border-line bg-panel p-3 text-sm text-zinc-600">
                    Latest saved result:{" "}
                    <span className="font-medium text-ink">
                      {currentMessages[currentMessages.length - 1].question}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
