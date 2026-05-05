"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  ChatMessageResponse,
  ChatResponse,
  Project,
  createProject,
  listChatMessages,
  listProjects,
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

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [name, setName] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [message, setMessage] = useState("");
  const [messagesByProject, setMessagesByProject] = useState<Record<string, ChatMessage[]>>({});
  const [projectSearch, setProjectSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const selectedProject = projects.find((project) => project.id === selectedProjectId);
  const currentMessages = selectedProjectId ? messagesByProject[selectedProjectId] ?? [] : [];
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
    listProjects()
      .then((items) => {
        setProjects(items);
        if (items[0]) {
          setSelectedProjectId(items[0].id);
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!selectedProjectId || messagesByProject[selectedProjectId]) {
      return;
    }

    listChatMessages(selectedProjectId)
      .then((items) => {
        setMessagesByProject((current) => ({
          ...current,
          [selectedProjectId]: items.map(toChatMessage),
        }));
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load chat history");
      });
  }, [messagesByProject, selectedProjectId]);

  async function handleCreateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const project = await createProject(name, repoUrl);
      setProjects((current) => [project, ...current]);
      setSelectedProjectId(project.id);
      setMessagesByProject((current) => ({ ...current, [project.id]: [] }));
      setName("");
      setRepoUrl("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setBusy(false);
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

    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await sendMessage(selectedProjectId, submittedQuestion);
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
      setMessagesByProject((current) => ({
        ...current,
        [selectedProjectId]: [...(current[selectedProjectId] ?? []), chatMessage],
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to ask question");
      setMessage(submittedQuestion);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="h-screen overflow-hidden bg-white text-ink">
      <div className="mx-auto grid h-screen max-w-7xl grid-cols-1 gap-0 lg:grid-cols-[360px_1fr]">
        <aside className="flex min-h-0 flex-col border-b border-line bg-panel p-6 lg:border-b-0 lg:border-r">
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
              Import Repo
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
            <div className="mt-3 max-h-[calc(100vh-390px)] space-y-2 overflow-y-auto pr-1">
              {filteredProjects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  className={`w-full rounded-md border px-3 py-2 text-left text-sm transition ${
                    selectedProjectId === project.id
                      ? "border-accent bg-white shadow-sm"
                      : "border-line bg-transparent hover:border-zinc-400 hover:bg-white"
                  }`}
                  onClick={() => {
                    setSelectedProjectId(project.id);
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
              ))}
              {filteredProjects.length === 0 ? (
                <p className="rounded-md border border-dashed border-line px-3 py-4 text-center text-sm text-zinc-500">
                  No projects found.
                </p>
              ) : null}
            </div>
          </div>
        </aside>

        <section className="flex min-h-0 flex-col p-6">
          <div className="border-b border-line pb-5">
            <h2 className="text-xl font-semibold">Codebase Chat</h2>
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
            {currentMessages.length > 0 ? (
              <div className="space-y-6">
                {currentMessages.map((item) => (
                  <article key={item.id} className="space-y-3">
                    <div className="ml-auto max-w-[78%] rounded-md bg-ink px-4 py-3 text-white">
                      <div className="mb-1 text-xs font-medium text-zinc-300">You at {item.createdAt}</div>
                      <p className="whitespace-pre-wrap leading-6">{item.question}</p>
                    </div>

                    <div className="max-w-[88%] rounded-md border border-line bg-white px-4 py-3">
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        RepoMind
                      </div>
                      <p className="whitespace-pre-wrap leading-7">{item.answer}</p>

                      {item.sources.length > 0 ? (
                        <details className="mt-4 rounded-md border border-line bg-panel">
                          <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-zinc-700">
                            View {item.sources.length} source references
                          </summary>
                          <div className="grid gap-2 border-t border-line p-3">
                            {item.sources.map((source) => (
                              <details
                                key={`${item.id}:${source.file_path}:${source.start_line}`}
                                className="rounded-md border border-line bg-white"
                              >
                                <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-zinc-700">
                                  {source.file_path}:{source.start_line}-{source.end_line}
                                </summary>
                                <pre className="max-h-72 overflow-auto border-t border-line bg-zinc-950 p-3 text-xs leading-5 text-zinc-100">
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
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-center text-sm text-zinc-500">
                {selectedProject
                  ? "Ask your first question about this repo."
                  : "Import or select a repo to start chatting."}
              </div>
            )}
          </div>

          <form className="flex gap-3 border-t border-line pt-4" onSubmit={handleChat}>
            <textarea
              className="min-h-20 flex-1 resize-none rounded-md border border-line px-3 py-2 outline-none focus:border-accent"
              placeholder="Ask about the selected repo..."
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              required
            />
            <button
              className="h-20 rounded-md bg-ink px-5 text-sm font-medium text-white disabled:opacity-60"
              disabled={busy || !selectedProjectId}
            >
              {busy ? "Thinking" : "Ask"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
