"use client";

import { FormEvent } from "react";
import { ChatSession, Project, User, GitHubRepo } from "@/lib/api";
import { X, FolderPlus, Layers, Trash2, Plus, MessageSquare, Edit2, RotateCw } from "lucide-react";

type ProjectSidebarProps = {
  filteredProjects: Project[];
  chatsByProject: Record<string, ChatSession[]>;
  selectedProjectId: string;
  selectedChatId: string;
  name: string;
  repoUrl: string;
  projectSearch: string;
  editingChatId: string;
  editingTitle: string;
  loadingProjects: boolean;
  isLoadingChats: boolean;
  busy: boolean;
  pendingAction: string;
  onCreateProject: (event: FormEvent<HTMLFormElement>) => void;
  onCreateChat: () => void;
  onDeleteProject: (projectId: string) => void;
  onReindexProject: (projectId: string) => void;
  onDeleteChat: (chatId: string) => void;
  onRenameChat: (event: FormEvent<HTMLFormElement>, chatId: string) => void;
  onSelectProject: (project: Project) => void;
  onSelectChat: (chatId: string) => void;
  setName: (value: string) => void;
  setRepoUrl: (value: string) => void;
  setProjectSearch: (value: string) => void;
  setEditingChatId: (value: string) => void;
  setEditingTitle: (value: string) => void;
  currentUser?: User | null;
  githubRepos?: GitHubRepo[];
  loadingGithubRepos?: boolean;
  // Responsive sidebar toggles
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
  collapsed?: boolean;
};

export function ProjectSidebar({
  filteredProjects,
  chatsByProject,
  selectedProjectId,
  selectedChatId,
  name,
  repoUrl,
  projectSearch,
  editingChatId,
  editingTitle,
  loadingProjects,
  isLoadingChats,
  busy,
  pendingAction,
  onCreateProject,
  onCreateChat,
  onDeleteProject,
  onReindexProject,
  onDeleteChat,
  onRenameChat,
  onSelectProject,
  onSelectChat,
  setName,
  setRepoUrl,
  setProjectSearch,
  setEditingChatId,
  setEditingTitle,
  currentUser,
  githubRepos,
  loadingGithubRepos,
  mobileOpen = false,
  onCloseMobile,
  collapsed = false,
}: ProjectSidebarProps) {
  return (
    <>
      {/* Mobile Overlay background */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden transition-opacity duration-300"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[320px] sm:w-[360px] flex-col border-r border-line/30 bg-brand-sidebar p-5 lg:static lg:flex lg:h-full lg:max-h-full lg:min-h-0 overflow-hidden transition-all duration-300 ease-in-out ${
          mobileOpen 
            ? "translate-x-0" 
            : collapsed
            ? "-translate-x-full lg:-translate-x-full lg:w-0 lg:p-0 lg:border-r-0"
            : "-translate-x-full lg:translate-x-0"
        }`}
      >
        {/* Brand Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/logo.jpg"
              alt="RepoMind Logo"
              className="h-10 w-10 rounded-xl border border-line/30 object-cover shadow-lg shadow-accent/15"
            />
            <div>
              <h1 className="bg-gradient-to-r from-ink via-indigo-500 to-accent bg-clip-text text-xl font-bold tracking-tight text-transparent">
                RepoMind AI
              </h1>
              <span className="text-[10px] uppercase font-semibold text-accent/80 tracking-widest">
                Coding Agent
              </span>
            </div>
          </div>
          {onCloseMobile && (
            <button
              type="button"
              className="rounded-lg p-1 text-textSecondary hover:bg-line/20 hover:text-ink lg:hidden"
              onClick={onCloseMobile}
            >
              <X size={16} />
            </button>
          )}
        </div>

        <p className="mt-3 text-xs leading-relaxed text-zinc-400">
          Index public Git repos & chat with safe, approval-gated editing agents.
        </p>

        {/* Project Import Form */}
        <form
          className="mt-6 space-y-2.5 rounded-xl border border-line/20 bg-panel/30 p-3"
          onSubmit={onCreateProject}
        >
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5 px-1">
            <FolderPlus size={11} className="text-accent" />
            Import Repository
          </span>
          {currentUser?.has_github && githubRepos && githubRepos.length > 0 ? (
            <div className="space-y-1.5">
              <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider px-1">
                Select from GitHub Repositories
              </label>
              <select
                className="w-full rounded-lg border border-line/50 bg-brand-bg px-3 py-2 text-xs text-ink outline-none focus:border-accent transition-all cursor-pointer"
                onChange={(event) => {
                  const selectedVal = event.target.value;
                  if (selectedVal) {
                    const selectedRepo = githubRepos.find(r => r.clone_url === selectedVal);
                    if (selectedRepo) {
                      setRepoUrl(selectedRepo.clone_url);
                      setName(selectedRepo.name);
                    }
                  } else {
                    setRepoUrl("");
                    setName("");
                  }
                }}
                defaultValue=""
              >
                <option value="" style={{ background: 'var(--color-brand-bg)' }}>-- Select a GitHub Repo --</option>
                {githubRepos.map((repo) => (
                  <option 
                    key={repo.clone_url} 
                    value={repo.clone_url}
                    style={{ background: 'var(--color-brand-bg)' }}
                  >
                    {repo.full_name} {repo.private ? "🔒" : "🌐"}
                  </option>
                ))}
              </select>
            </div>
          ) : loadingGithubRepos ? (
            <div className="flex items-center justify-center py-2 text-xs text-zinc-500 gap-1.5 animate-pulse">
              <RotateCw size={11} className="animate-spin" />
              <span>Loading your repositories...</span>
            </div>
          ) : null}
          <input
            className="w-full rounded-lg border border-line/50 bg-brand-bg px-3 py-2 text-xs text-ink placeholder-zinc-500 outline-none focus:border-accent transition-all"
            placeholder="Project display name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
          <input
            className="w-full rounded-lg border border-line/50 bg-brand-bg px-3 py-2 text-xs text-ink placeholder-zinc-500 outline-none focus:border-accent transition-all"
            placeholder="https://github.com/owner/repo"
            value={repoUrl}
            onChange={(event) => setRepoUrl(event.target.value)}
            required
          />
          <button
            className="w-full rounded-lg bg-accent py-2 text-xs font-bold text-white shadow-md shadow-accent/10 hover:bg-accent/90 transition-all disabled:opacity-50"
            disabled={busy}
          >
            {pendingAction === "import" ? "Importing Clone..." : "Clone & Index Repo"}
          </button>
        </form>

        {/* Projects Section */}
        <div className="mt-6 flex flex-1 flex-col min-h-0">
          <div className="flex items-center justify-between border-b border-line/10 pb-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
              <Layers size={12} className="text-accent" />
              Workspace Projects
            </h2>
            {filteredProjects.length > 0 && (
              <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">
                {filteredProjects.length}
              </span>
            )}
          </div>

          <input
            className="mt-3 w-full rounded-lg border border-line/50 bg-brand-bg px-3 py-2 text-xs text-ink placeholder-zinc-500 outline-none focus:border-accent transition-all"
            placeholder="🔍 Filter projects..."
            value={projectSearch}
            onChange={(event) => setProjectSearch(event.target.value)}
          />

          <div className="mt-4 flex-1 space-y-2.5 overflow-y-auto pr-1">
            {loadingProjects ? (
              <div className="space-y-2">
                <div className="h-16 animate-pulse rounded-lg bg-zinc-800/40" />
                <div className="h-16 animate-pulse rounded-lg bg-zinc-800/40" />
              </div>
            ) : null}

            {filteredProjects.map((project) => {
              const isSelected = selectedProjectId === project.id;
              return (
                <div key={project.id} className="space-y-1.5">
                  {/* Project Card */}
                  <div
                    className={`group/project relative rounded-lg border p-3 text-xs transition-all duration-200 ${
                      isSelected
                        ? "border-accent bg-accent-dim shadow-lg shadow-accent/5"
                        : "border-line/30 bg-panel/35 hover:border-line hover:bg-line/20"
                    }`}
                  >
                    <button
                      type="button"
                      className="min-w-0 w-full pr-16 text-left"
                      onClick={() => {
                        onSelectProject(project);
                        if (onCloseMobile) onCloseMobile();
                      }}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-semibold text-ink group-hover/project:text-accent transition">
                          {project.name}
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[9px] uppercase font-bold tracking-wider ${
                            project.status === "indexed"
                              ? "bg-emerald-dim text-emerald-400 border border-emerald-800/20"
                              : project.status.includes("failed")
                              ? "bg-rose-dim text-rose-450 border border-rose-800/20"
                              : "bg-amber-dim text-amber-500 border border-amber-800/20 animate-pulse"
                          }`}
                        >
                          {project.status}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-1 text-[10px] text-zinc-400">
                        <span className="truncate max-w-[140px] text-zinc-500">{project.repo_url}</span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider ${
                            currentUser?.has_github || (
                              project.access_mode === "write_enabled" &&
                              project.github_permissions?.push
                            )
                              ? "bg-emerald-900/20 text-emerald-400"
                              : "bg-amber-900/20 text-amber-400"
                          }`}
                        >
                          {currentUser?.has_github || (
                            project.access_mode === "write_enabled" &&
                            project.github_permissions?.push
                          )
                            ? "Editable"
                            : "Read-only"}
                        </span>
                      </div>
                    </button>

                    {/* Action hover buttons */}
                    <div className="absolute right-2 top-2 flex items-center gap-1 opacity-100 lg:opacity-0 lg:group-hover/project:opacity-100 focus-within:opacity-100 transition-opacity">
                      <button
                        type="button"
                        className="rounded bg-panel/50 border border-line/45 p-1.5 text-textSecondary hover:bg-accent hover:text-white transition disabled:opacity-40"
                        onClick={() => onReindexProject(project.id)}
                        disabled={
                          busy || project.status === "importing" || project.status === "indexing"
                        }
                        title="Reindex collection"
                      >
                        <RotateCw size={11} className={pendingAction === "reindex-project" ? "animate-spin text-white" : ""} />
                      </button>
                      <button
                        type="button"
                        className="rounded bg-red-950/10 border border-red-900/30 p-1.5 text-red-400 hover:bg-red-600 hover:text-white transition disabled:opacity-40"
                        onClick={() => onDeleteProject(project.id)}
                        disabled={busy}
                        title="Delete project data"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>

                  {/* Project Chats List (Only if Selected) */}
                  {isSelected && (
                    <div className="space-y-1 pl-2 sm:pl-3 border-l border-line/20 py-1">
                      <button
                        type="button"
                        className="w-full rounded-lg border border-dashed border-line/30 px-3 py-2 text-left text-xs font-semibold text-accent hover:border-accent hover:bg-accent/5 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                        onClick={onCreateChat}
                        disabled={busy}
                      >
                        <Plus size={13} />
                        <span>{pendingAction === "new-chat" ? "Creating Chat..." : "New Chat Thread"}</span>
                      </button>

                      {isLoadingChats ? (
                        <div className="px-3 py-2 text-xs text-zinc-500 animate-pulse">
                          Loading chats...
                        </div>
                      ) : null}

                      {!isLoadingChats && (chatsByProject[project.id] ?? []).length === 0 ? (
                        <div className="px-3 py-2 text-xs text-zinc-500 italic">
                          No active threads yet.
                        </div>
                      ) : null}

                      {(chatsByProject[project.id] ?? []).map((chat) => (
                        <div
                          key={chat.id}
                          className="group flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-line/10 transition"
                        >
                          {editingChatId === chat.id ? (
                            <form
                              className="flex min-w-0 flex-1 items-center gap-1 py-0.5"
                              onSubmit={(event) => onRenameChat(event, chat.id)}
                            >
                              <input
                                className="min-w-0 flex-1 rounded border border-line/60 bg-brand-bg px-2 py-1 text-xs text-ink outline-none focus:border-accent"
                                value={editingTitle}
                                onChange={(event) => setEditingTitle(event.target.value)}
                                autoFocus
                              />
                              <button
                                type="submit"
                                className="rounded bg-accent px-2 py-1 text-[10px] font-semibold text-white hover:bg-accent-light"
                                disabled={busy}
                              >
                                {pendingAction === "rename" ? "..." : "Save"}
                              </button>
                              <button
                                type="button"
                                className="rounded bg-zinc-800 px-2 py-1 text-[10px] font-medium text-zinc-400 hover:text-white"
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
                                className={`min-w-0 flex-1 truncate rounded-lg px-2 py-1.5 text-left text-xs transition flex items-center gap-1.5 ${
                                  selectedChatId === chat.id
                                    ? "bg-accent-dim text-accent font-semibold border border-accent/20"
                                    : "text-textSecondary hover:text-ink"
                                }`}
                                onClick={() => {
                                  onSelectChat(chat.id);
                                  if (onCloseMobile) onCloseMobile();
                                }}
                              >
                                <MessageSquare size={12} className={selectedChatId === chat.id ? "text-accent" : "text-zinc-500"} />
                                <span>{chat.title}</span>
                              </button>
                              <button
                                type="button"
                                className="rounded p-1 text-textSecondary opacity-100 lg:opacity-0 lg:group-hover:opacity-100 hover:bg-line/20 hover:text-ink transition"
                                onClick={() => {
                                  setEditingChatId(chat.id);
                                  setEditingTitle(chat.title);
                                }}
                                title="Rename chat"
                              >
                                <Edit2 size={11} />
                              </button>
                              <button
                                type="button"
                                className="rounded p-1 text-red-400 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 hover:bg-rose-dim hover:text-red-600 transition"
                                onClick={() => onDeleteChat(chat.id)}
                                title="Delete chat"
                                disabled={busy}
                              >
                                <X size={11} />
                              </button>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {!loadingProjects && filteredProjects.length === 0 ? (
              <p className="rounded-lg border border-dashed border-line/20 px-3 py-6 text-center text-xs text-zinc-500">
                No indexed workspaces found.
              </p>
            ) : null}
          </div>
        </div>
      </aside>
    </>
  );
}

