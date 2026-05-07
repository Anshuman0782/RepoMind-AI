"use client";

import { FormEvent } from "react";
import { ChatSession, Project } from "@/lib/api";

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
  onDeleteChat: (chatId: string) => void;
  onRenameChat: (event: FormEvent<HTMLFormElement>, chatId: string) => void;
  onSelectProject: (project: Project) => void;
  onSelectChat: (chatId: string) => void;
  setName: (value: string) => void;
  setRepoUrl: (value: string) => void;
  setProjectSearch: (value: string) => void;
  setEditingChatId: (value: string) => void;
  setEditingTitle: (value: string) => void;
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
  onDeleteChat,
  onRenameChat,
  onSelectProject,
  onSelectChat,
  setName,
  setRepoUrl,
  setProjectSearch,
  setEditingChatId,
  setEditingTitle,
}: ProjectSidebarProps) {
  return (
    <aside className="flex min-h-0 flex-col border-b border-line bg-panel p-3 sm:p-6 lg:border-b-0 lg:border-r">
      <h1 className="text-xl font-semibold leading-tight sm:text-2xl">RepoMind AI</h1>
      <p className="mt-1 text-xs leading-5 text-zinc-600 sm:mt-2 sm:text-sm sm:leading-6">
        Import a public GitHub repo, index it, and ask grounded questions about the code.
      </p>

      <form className="mt-4 space-y-2 sm:mt-8 sm:space-y-3" onSubmit={onCreateProject}>
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
                  onClick={() => onSelectProject(project)}
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
                  onClick={() => onDeleteProject(project.id)}
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
                    onClick={onCreateChat}
                    disabled={busy}
                  >
                    {pendingAction === "new-chat" ? "Creating chat..." : "+ New chat"}
                  </button>
                  {isLoadingChats ? (
                    <div className="rounded-md px-3 py-2 text-xs text-zinc-500">Loading chats...</div>
                  ) : null}
                  {!isLoadingChats && (chatsByProject[project.id] ?? []).length === 0 ? (
                    <div className="rounded-md px-3 py-2 text-xs text-zinc-500">No chats yet.</div>
                  ) : null}
                  {(chatsByProject[project.id] ?? []).map((chat) => (
                    <div key={chat.id} className="group flex flex-wrap items-center gap-1 sm:flex-nowrap">
                      {editingChatId === chat.id ? (
                        <form
                          className="flex min-w-0 flex-1 items-center gap-1"
                          onSubmit={(event) => onRenameChat(event, chat.id)}
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
                            onClick={() => onSelectChat(chat.id)}
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
                            onClick={() => onDeleteChat(chat.id)}
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
  );
}
