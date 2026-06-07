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
  startGitHubProjectAuth,
  User,
  getProfile,
  githubLoginUser,
  linkGitHubUser,
  GitHubRepo,
  listGitHubRepos,
} from "@/lib/api";
import { Sun, Moon, ChevronUp, ChevronDown, PanelLeftClose, PanelLeft, Loader2, Settings } from "lucide-react";

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
import AuthView from "./components/AuthView";
import SettingsModal from "./components/SettingsModal";
import { ChatMessage, WorkspaceMode } from "./types";
import { isDocumentationRequest, titleFromQuestion, toChatMessage } from "./utils";

const GithubIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    width="14"
    height="14"
    stroke="currentColor"
    strokeWidth="2.5"
    fill="none"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
  </svg>
);

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedChatId, setSelectedChatId] = useState("");
  const [name, setName] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [message, setMessage] = useState("");
  const [responseLanguage, setResponseLanguage] = useState("auto");
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
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [githubRepos, setGithubRepos] = useState<GitHubRepo[]>([]);
  const [loadingGithubRepos, setLoadingGithubRepos] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selectedProject = projects.find((project) => project.id === selectedProjectId);
  const isActualWriteEnabled = selectedProject?.access_mode === "write_enabled" || !!currentUser?.has_github;
  const selectedProjectCanWrite = isActualWriteEnabled;
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

  const loadProjectsList = () => {
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
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const token = localStorage.getItem("repomind_token");

    if (code) {
      window.history.replaceState({}, document.title, window.location.pathname);
      
      if (token) {
        setPendingAction("link-github");
        linkGitHubUser(code)
          .then((updatedUser) => {
            setCurrentUser(updatedUser);
            loadProjectsList();
          })
          .catch((err) => {
            setError(err instanceof Error ? err.message : "GitHub link failed");
          })
          .finally(() => {
            setPendingAction("");
          });
      } else {
        setCheckingAuth(true);
        githubLoginUser(code)
          .then((res) => {
            setCurrentUser(res.user);
          })
          .catch((err) => {
            setError(err instanceof Error ? err.message : "GitHub login failed");
          })
          .finally(() => {
            setCheckingAuth(false);
          });
      }
    } else if (token) {
      setCheckingAuth(true);
      getProfile()
        .then((user) => {
          setCurrentUser(user);
        })
        .catch((err) => {
          console.error("Token verification failed", err);
          localStorage.removeItem("repomind_token");
        })
        .finally(() => {
          setCheckingAuth(false);
        });
    } else {
      setCheckingAuth(false);
    }
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    loadProjectsList();
  }, [currentUser]);

  useEffect(() => {
    if (currentUser?.has_github) {
      setLoadingGithubRepos(true);
      listGitHubRepos()
        .then((repos) => {
          setGithubRepos(repos);
        })
        .catch((err) => {
          console.error("Failed to load GitHub repos", err);
        })
        .finally(() => {
          setLoadingGithubRepos(false);
        });
    } else {
      setGithubRepos([]);
    }
  }, [currentUser]);

  function handleLogout() {
    localStorage.removeItem("repomind_token");
    setCurrentUser(null);
    setProjects([]);
    setSelectedProjectId("");
    setSelectedChatId("");
    setChatsByProject({});
    setMessagesByChat({});
  }

  function handleLinkGitHub() {
    const clientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID || 'Ov23liakfpajpVfVMrhG';
    window.location.href = `https://github.com/login/oauth/authorize?client_id=${clientId}&scope=repo,user:email`;
  }

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
        responseLanguage,
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
      const response = await createChangePlan(
        selectedProjectId,
        activeChatId,
        submittedPrompt,
        responseLanguage,
      );
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
        responseLanguage,
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

  async function handleConnectGitHub() {
    if (!selectedProjectId) {
      setError("Please select a project first.");
      return;
    }

    setPendingAction("connect-github");
    setError("");
    try {
      const auth = await startGitHubProjectAuth(selectedProjectId);
      window.location.href = auth.auth_url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to initiate GitHub connection");
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
      const response = await sendMessage(
        selectedProjectId,
        activeChatId,
        submittedQuestion,
        responseLanguage,
      );
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

  if (checkingAuth) {
    return (
      <div className={`min-h-screen bg-brand-bg text-ink flex flex-col items-center justify-center ${theme === "light" ? "light-theme" : ""}`} style={{ background: 'var(--color-brand-bg)' }}>
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-600 rounded-full mix-blend-screen filter blur-3xl opacity-20 pointer-events-none animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-600 rounded-full mix-blend-screen filter blur-3xl opacity-20 pointer-events-none animate-pulse" style={{ animationDelay: '2s' }} />
        <div className="glass-panel p-8 rounded-2xl border border-line flex flex-col items-center gap-4 relative z-10" style={{ background: 'var(--color-glass-panel-bg)', borderColor: 'var(--color-glass-panel-border)' }}>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center animate-bounce" style={{ background: 'linear-gradient(135deg, var(--color-accent), #a78bfa)' }}>
            <Loader2 className="w-6 h-6 text-white animate-spin" />
          </div>
          <h2 className="text-xl font-bold tracking-tight" style={{ color: 'var(--color-text-primary)', fontFamily: 'Outfit' }}>Verifying Session...</h2>
          <p className="text-xs text-zinc-400">Securing your codebase exploration environment</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <AuthView onSuccess={(user) => setCurrentUser(user)} />;
  }

  return (
    <main className={`min-h-screen bg-brand-bg text-ink lg:h-screen lg:overflow-hidden ${theme === "light" ? "light-theme" : ""}`}>
      <div className={`mx-auto grid min-h-screen max-w-7xl grid-cols-1 gap-0 lg:h-screen transition-all duration-300 ${sidebarCollapsed ? "lg:grid-cols-[0px_1fr]" : "lg:grid-cols-[360px_1fr]"}`}>
        <ProjectSidebar
          collapsed={sidebarCollapsed}
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
          currentUser={currentUser}
          githubRepos={githubRepos}
          loadingGithubRepos={loadingGithubRepos}
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
          mobileOpen={mobileSidebarOpen}
          onCloseMobile={() => setMobileSidebarOpen(false)}
        />

        <section className="flex min-h-[520px] flex-col p-4 sm:p-6 lg:min-h-0 min-w-0">
          {/* Header Bar */}
          <div className="border-b border-line/20 pb-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5 min-w-0">
              {/* Mobile Hamburger Trigger */}
              <button
                type="button"
                className="lg:hidden rounded-lg p-2.5 bg-panel border border-line/35 hover:bg-line/45 text-ink transition"
                onClick={() => setMobileSidebarOpen(true)}
              >
                ☰
              </button>

              {/* Desktop Sidebar Toggle Button */}
              <button
                type="button"
                className="hidden lg:flex rounded-lg p-2 bg-panel border border-line/25 hover:bg-line/45 text-zinc-400 hover:text-ink transition-all duration-200"
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                title={sidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
              >
                {sidebarCollapsed ? <PanelLeft size={16} /> : <PanelLeftClose size={16} />}
              </button>

              <h2 className="break-words text-lg font-bold sm:text-xl bg-gradient-to-r from-ink to-textSecondary bg-clip-text text-transparent truncate flex items-center gap-2">
                <span>{selectedChat?.title ?? "Codebase Chat"}</span>
              </h2>
            </div>

            <div className="flex items-center gap-2.5">
              {currentUser && (
                <div className="flex items-center gap-2.5 border-r border-line/20 pr-2.5">
                  <div className="flex flex-col items-end hidden sm:flex">
                    <span className="text-xs font-bold text-zinc-300">{currentUser.username}</span>
                    {currentUser.has_github && (
                      <span className="text-[9px] text-purple-400 flex items-center gap-1 font-semibold">
                        <GithubIcon style={{ width: 10, height: 10 }} /> Linked
                      </span>
                    )}
                  </div>
                </div>
              )}

              {selectedProject && (
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${
                      isActualWriteEnabled
                        ? "bg-emerald-dim text-emerald-400 border-emerald-800/20"
                        : "bg-amber-dim text-amber-505 border-amber-800/20"
                    }`}
                  >
                    {isActualWriteEnabled ? "Editable" : "Read-only"}
                  </span>
                  {!isActualWriteEnabled && !currentUser?.has_github && (
                    <button
                      type="button"
                      onClick={handleConnectGitHub}
                      disabled={busy}
                      className="rounded bg-indigo-600 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-indigo-500 transition disabled:opacity-50"
                    >
                      Connect GitHub
                    </button>
                  )}
                </div>
              )}

              {/* Collapsible Header Trigger */}
              <button
                type="button"
                className="rounded-lg p-2 bg-panel border border-line/25 hover:bg-line/45 text-zinc-400 hover:text-ink transition-all duration-200"
                onClick={() => setHeaderCollapsed(!headerCollapsed)}
                title={headerCollapsed ? "Show Header & Tabs" : "Focus Mode (Hide Header & Tabs)"}
              >
                {headerCollapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
              </button>

              {/* Theme Changer */}
              <button
                type="button"
                className="rounded-lg p-2 bg-panel border border-line/25 hover:bg-line/45 text-zinc-400 hover:text-ink transition-all duration-200"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
              >
                {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
              </button>

              {/* Settings Toggle */}
              <button
                type="button"
                className="rounded-lg p-2 bg-panel border border-line/25 hover:bg-line/45 text-zinc-400 hover:text-ink transition-all duration-200"
                onClick={() => setSettingsOpen(true)}
                title="Open Workspace Settings"
              >
                <Settings size={15} />
              </button>
            </div>
          </div>

          {/* Collapsible Subtitle and Tabs area */}
          <div className={`transition-all duration-300 ease-in-out overflow-hidden ${headerCollapsed ? "max-h-0 opacity-0 mt-0" : "max-h-40 opacity-100 mt-2"}`}>
            {selectedProject ? (
              <p className="text-xs text-zinc-500 truncate">
                Selected workspace: <span className="text-zinc-300 font-semibold">{selectedProject.name}</span> <span className="text-zinc-600">({selectedProject.repo_url})</span>
              </p>
            ) : (
              <p className="text-xs text-zinc-500">
                Import or select a project, then ask a question about the code.
              </p>
            )}

            <WorkspaceTabs workspaceMode={workspaceMode} selectedProjectId={selectedProjectId} setWorkspaceMode={setWorkspaceMode} />
          </div>

          {error ? (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {workspaceMode === "chat" ? (
            <ChatView
              selectedProject={selectedProject}
              selectedChat={selectedChat}
              selectedProjectId={selectedProjectId}
              currentMessages={currentMessages}
              pendingQuestion={pendingQuestion}
              pendingAction={pendingAction}
              message={message}
              responseLanguage={responseLanguage}
              busy={busy}
              isLoadingMessages={isLoadingMessages}
              activeEditChangeSet={activeEditChangeSet}
              plannerChangeSetId={plannerChangeSetId}
              commitPreview={commitPreview}
              createdCommit={createdCommit}
              messagesEndRef={messagesEndRef}
              setMessage={setMessage}
              setResponseLanguage={setResponseLanguage}
              setWorkspaceMode={setWorkspaceMode}
              onChat={handleChat}
              onApproveEdit={handleApprovePlannerAutomation}
              onRejectEdit={handleRejectEditChangeSet}
              onApproveReview={handleApprovePlannerReview}
              onCreateCommit={handleCreateCommit}
              onConnectGitHub={handleConnectGitHub}
              onOpenFile={handleOpenFile}
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
              canWrite={selectedProjectCanWrite}
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
              canWrite={selectedProjectCanWrite}
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

      {currentUser && (
        <SettingsModal
          isOpen={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          currentUser={currentUser}
          onUserUpdate={setCurrentUser}
          theme={theme}
          setTheme={setTheme}
          onLogout={handleLogout}
        />
      )}
    </main>
  );
}
