"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  CodeSearchResult,
  ChatSession,
  CommitAssistantPreview,
  CreatedCommit,
  EditChangeSet,
  FileEditOperation,
  FileContent,
  FileEntry,
  Project,
  applyEditChangeSet,
  createCommit,
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
  reindexProject,
  previewCommitAssistant,
  renameChatSession,
  rollbackEditChangeSet,
  searchProjectCode,
  sendMessage,
  reviewCodeChanges,
} from "@/lib/api";

import { ChatView } from "./components/ChatView";
import { ArchitectureView } from "./components/ArchitectureView";
import { CommitView } from "./components/CommitView";
import { EditorView } from "./components/EditorView";
import { FilesView } from "./components/FilesView";
import { NavigatorView } from "./components/NavigatorView";
import { PlannerView } from "./components/PlannerView";
import { ProjectSidebar } from "./components/ProjectSidebar";
import { ReviewView } from "./components/ReviewView";
import { WorkspaceTabs } from "./components/WorkspaceTabs";
import { ChatMessage, WorkspaceMode } from "./types";
import { isDocumentationRequest, titleFromQuestion, toChatMessage } from "./utils";

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
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("chat");
  const [investigationMode, setInvestigationMode] = useState<"navigator" | "bug">("navigator");
  const [investigationPrompt, setInvestigationPrompt] = useState("");
  const [plannerPrompt, setPlannerPrompt] = useState("");
  const [reviewPrompt, setReviewPrompt] = useState("");
  const [commitContext, setCommitContext] = useState("");
  const [commitPreview, setCommitPreview] = useState<CommitAssistantPreview | null>(null);
  const [createdCommit, setCreatedCommit] = useState<CreatedCommit | null>(null);
  const [editAction, setEditAction] = useState<FileEditOperation["action"]>("edit");
  const [editFilePath, setEditFilePath] = useState("");
  const [editContent, setEditContent] = useState("");
  const [activeEditChangeSet, setActiveEditChangeSet] = useState<EditChangeSet | null>(null);
  const [plannerChangeSetId, setPlannerChangeSetId] = useState("");
  const [plannerAutomationPrompt, setPlannerAutomationPrompt] = useState("");
  const [plannerAutomationChatId, setPlannerAutomationChatId] = useState("");
  const [plannerAutomationStatus, setPlannerAutomationStatus] = useState("");
  const [reviewSuggestionFiles, setReviewSuggestionFiles] = useState<string[]>([]);
  const [reviewSuggestionChangeSetId, setReviewSuggestionChangeSetId] = useState("");
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
    if (!selectedProjectId || !selectedProject) {
      return;
    }
    if (selectedProject.status !== "importing" && selectedProject.status !== "indexing") {
      return;
    }

    const timer = window.setInterval(() => {
      listProjects()
        .then((items) => {
          const updatedProject = items.find((project) => project.id === selectedProjectId);
          setProjects(items);
          if (updatedProject && updatedProject.status !== selectedProject.status) {
            setFilesByProject((current) => {
              const next = { ...current };
              delete next[selectedProjectId];
              return next;
            });
          }
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : "Failed to refresh project status");
        });
    }, 2500);

    return () => window.clearInterval(timer);
  }, [selectedProject?.status, selectedProjectId]);

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

  async function handleReindexProject(projectId: string) {
    const project = projects.find((item) => item.id === projectId);
    const confirmed = window.confirm(
      `Re-index ${project?.name ?? "this project"} using the current embedding provider?`,
    );
    if (!confirmed) {
      return;
    }

    setPendingAction("reindex-project");
    setError("");
    try {
      setProjects((current) =>
        current.map((item) => (item.id === projectId ? { ...item, status: "indexing" } : item)),
      );
      const updatedProject = await reindexProject(projectId);
      setProjects((current) =>
        current.map((item) => (item.id === projectId ? updatedProject : item)),
      );
      setFilesByProject((current) => {
        const next = { ...current };
        delete next[projectId];
        return next;
      });
      setFileContentsByKey((current) => {
        const next: Record<string, FileContent> = {};
        for (const [key, value] of Object.entries(current)) {
          if (!key.startsWith(`${projectId}:`)) {
            next[key] = value;
          }
        }
        return next;
      });
      if (selectedProjectId === projectId) {
        setSelectedFilePath("");
        setSearchResults([]);
        setGitDiff("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to re-index project");
      setProjects((current) =>
        current.map((item) => (item.id === projectId ? { ...item, status: project?.status ?? item.status } : item)),
      );
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
    setPlannerChangeSetId("");
    setPlannerAutomationPrompt("");
    setPlannerAutomationChatId("");
    setPlannerAutomationStatus("");
    setCommitPreview(null);
    setCreatedCommit(null);
    setReviewSuggestionFiles([]);
    setReviewSuggestionChangeSetId("");
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
      setReviewSuggestionFiles(updated.files);
      setReviewSuggestionChangeSetId(updated.id);
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
      setReviewSuggestionFiles([]);
      setReviewSuggestionChangeSetId("");
      setPlannerChangeSetId("");
      setPlannerAutomationPrompt("");
      setPlannerAutomationChatId("");
      setPlannerAutomationStatus("");
      setCommitPreview(null);
      setCreatedCommit(null);
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
      setReviewSuggestionFiles([]);
      setReviewSuggestionChangeSetId("");
      setPlannerChangeSetId("");
      setPlannerAutomationPrompt("");
      setPlannerAutomationChatId("");
      setPlannerAutomationStatus("");
      setCommitPreview(null);
      setCreatedCommit(null);
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
      const plannerLabel = isDocumentationRequest(submittedPrompt) ? "Documentation agent" : "Change planner";
      const chatMessage: ChatMessage = {
        id: crypto.randomUUID(),
        question: `${plannerLabel}: ${submittedPrompt}`,
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
      if (response.proposed_operations?.length) {
        try {
          const changeSet = await createEditChangeSet(selectedProjectId, response.proposed_operations);
          setActiveEditChangeSet(changeSet);
          setPlannerChangeSetId(changeSet.id);
          setPlannerAutomationPrompt(submittedPrompt);
          setPlannerAutomationChatId(activeChatId);
          setPlannerAutomationStatus("Editor Agent prepared a diff preview. Approve the edit, then Commit Assistant will draft commit and PR copy before Review Agent.");
          setCommitContext(submittedPrompt);
          setCommitPreview(null);
          setCreatedCommit(null);
          const firstOperation = response.proposed_operations[0];
          setEditAction(firstOperation.action);
          setEditFilePath(firstOperation.path);
          setEditContent(firstOperation.content ?? "");
        } catch (previewError) {
          setPlannerAutomationStatus("");
          setError(previewError instanceof Error ? previewError.message : "Planner could not prepare an edit preview");
        }
      } else {
        setPlannerChangeSetId("");
        setPlannerAutomationPrompt("");
        setPlannerAutomationChatId("");
        setPlannerAutomationStatus("");
        setCommitPreview(null);
        setCreatedCommit(null);
      }
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
      setWorkspaceMode(response.proposed_operations?.length ? "planner" : "chat");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create change plan");
      setPlannerPrompt(submittedPrompt);
    } finally {
      setPendingAction("");
      setPendingQuestion("");
    }
  }

  async function runCodeReview(submittedPrompt: string, changeSetId?: string, chatIdOverride?: string) {
    if (!selectedProjectId) {
      setError("Create or select a project first.");
      return;
    }

    const reviewLabel = submittedPrompt || "Current diff";

    setPendingAction("code-review");
    setPendingQuestion(`Code review: ${reviewLabel}`);
    setError("");
    setReviewPrompt("");
    try {
      let activeChatId = chatIdOverride || selectedChatId;
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
      const response = await reviewCodeChanges(
        selectedProjectId,
        activeChatId,
        submittedPrompt,
        changeSetId,
      );
      const chatMessage: ChatMessage = {
        id: crypto.randomUUID(),
        question: `Code review: ${reviewLabel}`,
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
                  title: titleFromQuestion(reviewLabel),
                  updated_at: new Date().toISOString(),
                }
              : chat,
          ),
        }));
      }
      setWorkspaceMode("chat");
      setReviewSuggestionFiles([]);
      setReviewSuggestionChangeSetId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to review code changes");
      setReviewPrompt(submittedPrompt);
    } finally {
      setPendingAction("");
      setPendingQuestion("");
    }
  }

  async function handleCodeReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runCodeReview(reviewPrompt.trim());
  }

  async function handlePreviewCommit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProjectId) {
      setError("Create or select a project first.");
      return;
    }

    setPendingAction("commit-preview");
    setError("");
    setCreatedCommit(null);
    try {
      const preview = await previewCommitAssistant(selectedProjectId, commitContext.trim());
      setCommitPreview(preview);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to draft commit details");
    } finally {
      setPendingAction("");
    }
  }

  async function handleCreateCommit() {
    if (!selectedProjectId || !commitPreview) {
      return;
    }

    const messageToCommit = commitPreview.commit_message.trim();
    if (!messageToCommit) {
      setError("Commit message cannot be empty.");
      return;
    }

    const confirmed = window.confirm(
      "Commit all current repository changes and push this commit to GitHub?",
    );
    if (!confirmed) {
      return;
    }

    setPendingAction("create-commit");
    setError("");
    try {
      const commit = await createCommit(selectedProjectId, messageToCommit);
      setCreatedCommit(commit);
      setCommitPreview((current) => (current ? { ...current, diff: "" } : current));
      if (activeEditChangeSet?.id === plannerChangeSetId) {
        setPlannerAutomationStatus(`Commit pushed to ${commit.remote}/${commit.branch}. Review Agent is still available for a final check.`);
      }
      setGitDiff("No uncommitted changes.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create commit");
    } finally {
      setPendingAction("");
    }
  }

  function updateCommitPreviewField<K extends keyof CommitAssistantPreview>(
    key: K,
    value: CommitAssistantPreview[K],
  ) {
    setCommitPreview((current) => (current ? { ...current, [key]: value } : current));
  }

  async function handleSuggestedCodeReview() {
    const fileList = reviewSuggestionFiles.join(", ");
    const prompt = fileList
      ? `Review the just-applied edit change set. Focus on these files: ${fileList}`
      : "Review the just-applied edit change set.";
    await runCodeReview(prompt, reviewSuggestionChangeSetId);
  }

  async function handleApprovePlannerAutomation() {
    if (!selectedProjectId || !activeEditChangeSet || activeEditChangeSet.id !== plannerChangeSetId) {
      return;
    }

    setPendingAction("planner-automation");
    setError("");
    setPlannerAutomationStatus("Editor Agent is applying the approved change...");
    setCommitPreview(null);
    setCreatedCommit(null);
    try {
      const updated = await applyEditChangeSet(selectedProjectId, activeEditChangeSet.id);
      setActiveEditChangeSet(updated);
      updated.files.forEach(clearCachedFile);
      const diff = await getProjectGitDiff(selectedProjectId);
      setGitDiff(diff || "No uncommitted changes.");
      setPlannerAutomationStatus("Edit applied. Commit Assistant is drafting commit and PR copy...");
      const commitDraft = await previewCommitAssistant(
        selectedProjectId,
        plannerAutomationPrompt || "Planner-approved edit",
      );
      setCommitPreview(commitDraft);
      setPlannerAutomationStatus(
        commitDraft.has_changes
          ? "Commit Assistant drafted commit and PR copy. GitHub push and Review Agent both require your approval."
          : "Edit applied, but Commit Assistant did not find an uncommitted diff. Review Agent is ready after approval.",
      );
      setReviewSuggestionFiles(updated.files);
      setReviewSuggestionChangeSetId(updated.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Planner automation failed");
    } finally {
      setPendingAction("");
      setPendingQuestion("");
    }
  }

  async function handleApprovePlannerReview() {
    if (!activeEditChangeSet || activeEditChangeSet.id !== plannerChangeSetId) {
      return;
    }

    setPendingAction("planner-review");
    setError("");
    try {
      const fileList = activeEditChangeSet.files.join(", ");
      setPlannerAutomationStatus("Review Agent is checking the applied change...");
      await runCodeReview(
        fileList
          ? `Review the Planner-approved change. Focus on these files: ${fileList}`
          : "Review the Planner-approved change.",
        activeEditChangeSet.id,
        plannerAutomationChatId,
      );
      setPlannerAutomationStatus("Planner finished the edit and review flow.");
      setPlannerChangeSetId("");
      setPlannerAutomationPrompt("");
      setPlannerAutomationChatId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Review Agent failed");
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
      let actionChangeSetId = "";
      if (response.proposed_operations?.length) {
        try {
          const changeSet = await createEditChangeSet(selectedProjectId, response.proposed_operations);
          setActiveEditChangeSet(changeSet);
          setPlannerChangeSetId(changeSet.id);
          setPlannerAutomationPrompt(submittedQuestion);
          setPlannerAutomationChatId(activeChatId);
          setPlannerAutomationStatus("Editor Agent prepared a diff preview. You can approve it here in Chat or open Planner for the larger workspace.");
          setCommitContext(submittedQuestion);
          setCommitPreview(null);
          setCreatedCommit(null);
          const firstOperation = response.proposed_operations[0];
          setEditAction(firstOperation.action);
          setEditFilePath(firstOperation.path);
          setEditContent(firstOperation.content ?? "");
          actionChangeSetId = changeSet.id;
        } catch (previewError) {
          setError(previewError instanceof Error ? previewError.message : "Agent could not prepare an edit preview");
        }
      } else if (
        response.agent_status === "redirect_required" &&
        response.suggested_workspace_mode === "editor"
      ) {
        setEditAction((response.suggested_action as FileEditOperation["action"]) || "edit");
        setEditFilePath(response.suggested_path || "");
        setEditContent("");
        setActiveEditChangeSet(null);
      }
      const chatMessage: ChatMessage = {
        id: crypto.randomUUID(),
        question: submittedQuestion,
        answer: response.answer,
        sources: response.sources,
        createdAt: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        routedAgent: response.routed_agent,
        agentStatus: response.agent_status,
        suggestedWorkspaceMode: response.suggested_workspace_mode as WorkspaceMode | null,
        suggestedAction: response.suggested_action,
        suggestedPath: response.suggested_path,
        actionChangeSetId: actionChangeSetId || undefined,
      };
      if (response.suggested_workspace_mode === "architecture") {
        setWorkspaceMode("architecture");
      }
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
        <ProjectSidebar
          filteredProjects={filteredProjects}
          chatsByProject={chatsByProject}
          selectedProjectId={selectedProjectId}
          selectedChatId={selectedChatId}
          name={name}
          repoUrl={repoUrl}
          projectSearch={projectSearch}
          editingChatId={editingChatId}
          editingTitle={editingTitle}
          loadingProjects={loadingProjects}
          isLoadingChats={isLoadingChats}
          busy={busy}
          pendingAction={pendingAction}
          onCreateProject={handleCreateProject}
          onCreateChat={handleCreateChat}
          onDeleteProject={handleDeleteProject}
          onReindexProject={handleReindexProject}
          onDeleteChat={handleDeleteChat}
          onRenameChat={handleRenameChat}
          onSelectProject={(project) => {
            setSelectedProjectId(project.id);
            setSelectedChatId(chatsByProject[project.id]?.[0]?.id ?? "");
            setSelectedFilePath("");
            setSearchResults([]);
            setGitDiff("");
            setActiveEditChangeSet(null);
            setCommitPreview(null);
            setCreatedCommit(null);
            setError("");
          }}
          onSelectChat={(chatId) => {
            setSelectedChatId(chatId);
            setError("");
          }}
          setName={setName}
          setRepoUrl={setRepoUrl}
          setProjectSearch={setProjectSearch}
          setEditingChatId={setEditingChatId}
          setEditingTitle={setEditingTitle}
        />

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

          <WorkspaceTabs workspaceMode={workspaceMode} selectedProjectId={selectedProjectId} setWorkspaceMode={setWorkspaceMode} />

          {workspaceMode === "chat" ? (
            <ChatView
              selectedProject={selectedProject}
              selectedChat={selectedChat}
              selectedProjectId={selectedProjectId}
              currentMessages={currentMessages}
              pendingQuestion={pendingQuestion}
              pendingAction={pendingAction}
              message={message}
              busy={busy}
              isLoadingMessages={isLoadingMessages}
              activeEditChangeSet={activeEditChangeSet}
              plannerChangeSetId={plannerChangeSetId}
              commitPreview={commitPreview}
              createdCommit={createdCommit}
              messagesEndRef={messagesEndRef}
              setMessage={setMessage}
              setWorkspaceMode={setWorkspaceMode}
              onChat={handleChat}
              onApproveEdit={handleApprovePlannerAutomation}
              onRejectEdit={handleRejectEditChangeSet}
              onApproveReview={handleApprovePlannerReview}
              onCreateCommit={handleCreateCommit}
              onSkipReview={() => {
                setPlannerChangeSetId("");
                setPlannerAutomationPrompt("");
                setPlannerAutomationChatId("");
                setPlannerAutomationStatus("");
                setCommitPreview(null);
                setCreatedCommit(null);
                setReviewSuggestionFiles([]);
                setReviewSuggestionChangeSetId("");
              }}
            />
          ) : workspaceMode === "files" ? (
            <FilesView
              selectedProject={selectedProject}
              selectedProjectId={selectedProjectId}
              filteredFiles={filteredFiles}
              selectedFilePath={selectedFilePath}
              selectedFileContent={selectedFileContent}
              fileFilter={fileFilter}
              codeSearch={codeSearch}
              searchResults={searchResults}
              gitDiff={gitDiff}
              loadingFilesProjectId={loadingFilesProjectId}
              loadingFilePath={loadingFilePath}
              busy={busy}
              pendingAction={pendingAction}
              setFileFilter={setFileFilter}
              setCodeSearch={setCodeSearch}
              onOpenFile={handleOpenFile}
              onSearchCode={handleSearchCode}
              onReadGitDiff={handleReadGitDiff}
            />
          ) : workspaceMode === "architecture" ? (
            <ArchitectureView
              selectedProject={selectedProject}
              selectedProjectId={selectedProjectId}
              files={projectFiles}
              loadingFilesProjectId={loadingFilesProjectId}
              onOpenFile={handleOpenFile}
            />
          ) : workspaceMode === "navigator" ? (
            <NavigatorView
              selectedProjectId={selectedProjectId}
              busy={busy}
              pendingAction={pendingAction}
              investigationMode={investigationMode}
              investigationPrompt={investigationPrompt}
              currentMessages={currentMessages}
              setInvestigationMode={setInvestigationMode}
              setInvestigationPrompt={setInvestigationPrompt}
              onInvestigation={handleInvestigation}
            />
          ) : workspaceMode === "editor" ? (
            <EditorView
              selectedProjectId={selectedProjectId}
              busy={busy}
              pendingAction={pendingAction}
              editAction={editAction}
              editFilePath={editFilePath}
              editContent={editContent}
              activeEditChangeSet={activeEditChangeSet}
              loadingEditFilePath={loadingEditFilePath}
              reviewSuggestionFiles={reviewSuggestionFiles}
              setEditAction={setEditAction}
              setEditFilePath={setEditFilePath}
              setEditContent={setEditContent}
              setActiveEditChangeSet={setActiveEditChangeSet}
              clearReviewSuggestion={() => {
                setReviewSuggestionFiles([]);
                setReviewSuggestionChangeSetId("");
              }}
              loadEditorFileContent={loadEditorFileContent}
              onCreateEditPreview={handleCreateEditPreview}
              onApplyEdit={handleApplyEditChangeSet}
              onRejectEdit={handleRejectEditChangeSet}
              onRollbackEdit={handleRollbackEditChangeSet}
              onSuggestedCodeReview={handleSuggestedCodeReview}
            />
          ) : workspaceMode === "planner" ? (
            <PlannerView
              selectedProjectId={selectedProjectId}
              busy={busy}
              pendingAction={pendingAction}
              plannerPrompt={plannerPrompt}
              activeEditChangeSet={activeEditChangeSet}
              plannerChangeSetId={plannerChangeSetId}
              plannerAutomationPrompt={plannerAutomationPrompt}
              plannerAutomationStatus={plannerAutomationStatus}
              commitPreview={commitPreview}
              createdCommit={createdCommit}
              currentMessages={currentMessages}
              setPlannerPrompt={setPlannerPrompt}
              setCommitMessage={(value) => updateCommitPreviewField("commit_message", value)}
              setPrTitle={(value) => updateCommitPreviewField("pr_title", value)}
              setPrDescription={(value) => updateCommitPreviewField("pr_description", value)}
              onChangePlan={handleChangePlan}
              onApproveEdit={handleApprovePlannerAutomation}
              onCreateCommit={handleCreateCommit}
              onRejectEdit={handleRejectEditChangeSet}
              onApproveReview={handleApprovePlannerReview}
              onSkipReview={() => {
                setPlannerChangeSetId("");
                setPlannerAutomationPrompt("");
                setPlannerAutomationChatId("");
                setPlannerAutomationStatus("");
                setCommitPreview(null);
                setCreatedCommit(null);
                setReviewSuggestionFiles([]);
                setReviewSuggestionChangeSetId("");
              }}
            />
          ) : workspaceMode === "review" ? (
            <ReviewView
              selectedProjectId={selectedProjectId}
              busy={busy}
              pendingAction={pendingAction}
              reviewPrompt={reviewPrompt}
              currentMessages={currentMessages}
              setReviewPrompt={setReviewPrompt}
              onCodeReview={handleCodeReview}
            />
          ) : (
            <CommitView
              selectedProjectId={selectedProjectId}
              busy={busy}
              pendingAction={pendingAction}
              commitContext={commitContext}
              commitPreview={commitPreview}
              createdCommit={createdCommit}
              setCommitContext={setCommitContext}
              setCommitMessage={(value) => updateCommitPreviewField("commit_message", value)}
              setPrTitle={(value) => updateCommitPreviewField("pr_title", value)}
              setPrDescription={(value) => updateCommitPreviewField("pr_description", value)}
              onPreviewCommit={handlePreviewCommit}
              onCreateCommit={handleCreateCommit}
            />
          )}
        </section>
      </div>
    </main>
  );
}
