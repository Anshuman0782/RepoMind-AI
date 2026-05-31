"use client";

import { FormEvent, RefObject } from "react";
import { Check, ExternalLink, Send, X, Globe, Sparkles } from "lucide-react";
import { CommitAssistantPreview, CreatedCommit, EditChangeSet, Project } from "@/lib/api";
import { ChatMessage, WorkspaceMode } from "../types";
import { AnswerContent } from "./AnswerContent";

type ChatViewProps = {
  selectedProject: Project | undefined;
  selectedChat: { title: string } | undefined;
  selectedProjectId: string;
  currentMessages: ChatMessage[];
  pendingQuestion: string;
  pendingAction: string;
  message: string;
  responseLanguage: string;
  busy: boolean;
  isLoadingMessages: boolean;
  activeEditChangeSet: EditChangeSet | null;
  plannerChangeSetId: string;
  commitPreview: CommitAssistantPreview | null;
  createdCommit: CreatedCommit | null;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  setMessage: (value: string) => void;
  setResponseLanguage: (value: string) => void;
  setWorkspaceMode: (mode: WorkspaceMode) => void;
  onChat: (event: FormEvent<HTMLFormElement>) => void;
  onApproveEdit: () => void;
  onRejectEdit: () => void;
  onApproveReview: () => void;
  onSkipReview: () => void;
  onCreateCommit: () => void;
  onConnectGitHub: () => void;
};

export function ChatView({
  selectedProject,
  selectedChat,
  selectedProjectId,
  currentMessages,
  pendingQuestion,
  pendingAction,
  message,
  responseLanguage,
  busy,
  isLoadingMessages,
  activeEditChangeSet,
  plannerChangeSetId,
  commitPreview,
  createdCommit,
  messagesEndRef,
  setMessage,
  setResponseLanguage,
  setWorkspaceMode,
  onChat,
  onApproveEdit,
  onRejectEdit,
  onApproveReview,
  onSkipReview,
  onCreateCommit,
  onConnectGitHub,
}: ChatViewProps) {
  const projectStatus = selectedProject?.status ?? "";
  const isProjectBusy = projectStatus === "importing" || projectStatus === "indexing";
  const isProjectFailed = projectStatus.endsWith("_failed") || projectStatus.endsWith("_interrupted");
  const canAsk = Boolean(selectedProjectId) && !isProjectBusy && !isProjectFailed;
  const placeholder = !selectedProject
    ? "Select a project in the sidebar first..."
    : isProjectBusy
      ? "Please wait, indexing this repository..."
      : isProjectFailed
        ? "Fix or re-index this repository to unlock chat..."
        : "Ask anything about the codebase (e.g. 'Where is auth handled?')...";

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto py-4 pr-1 sm:py-6 space-y-6">
        {isLoadingMessages ? (
          <div className="space-y-6">
            <div className="ml-auto h-16 max-w-[70%] animate-pulse rounded-2xl bg-zinc-800/40" />
            <div className="h-32 max-w-[85%] animate-pulse rounded-2xl border border-line/20 bg-panel" />
          </div>
        ) : currentMessages.length > 0 || pendingQuestion ? (
          <div className="space-y-6">
            {currentMessages.map((item) => (
              <article key={item.id} className="space-y-4">
                {/* User Message Bubble */}
                <div className="ml-auto max-w-full rounded-2xl rounded-tr-none bg-accent border border-accent/25 px-4 py-3.5 text-sm text-white sm:max-w-[78%] shadow-lg shadow-accent/10">
                  <div className="mb-1 text-[10px] font-bold text-white/70 tracking-wider uppercase">
                    You • {item.createdAt}
                  </div>
                  <p className="whitespace-pre-wrap leading-relaxed text-white">{item.question}</p>
                </div>

                {/* Agent Response Card */}
                <div className="max-w-full rounded-2xl rounded-tl-none border border-line/20 bg-panel px-4 py-4 text-sm sm:max-w-[88%] shadow-xl shadow-black/30">
                  <div className="mb-3 flex items-center justify-between gap-3 text-xs font-semibold text-zinc-400">
                    <div className="flex items-center gap-2">
                      <img
                        src="/logo.jpg"
                        alt="RepoMind"
                        className="h-5 w-5 rounded-md border border-line/30 object-cover shadow-sm"
                      />
                      <span className="font-bold tracking-wide bg-gradient-to-r from-accent to-zinc-200 bg-clip-text text-transparent">
                        RepoMind AI
                      </span>
                      {item.routedAgent && (
                        <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-accent border border-accent/10">
                          {item.routedAgent.replace("_", " ")}
                        </span>
                      )}
                    </div>
                    {item.sources.length > 0 ? (
                      <span className="rounded-full bg-brand-bg border border-line/20 px-2.5 py-0.5 text-[10px] text-textSecondary">
                        📁 {item.sources.length} sources referenced
                      </span>
                    ) : null}
                  </div>

                  <AnswerContent answer={item.answer} />

                  {/* Dynamic Action Handlers */}
                  {item.actionChangeSetId && activeEditChangeSet?.id === item.actionChangeSetId ? (
                    <AgentActionPanel
                      changeSet={activeEditChangeSet}
                      isPlannerChangeSet={plannerChangeSetId === item.actionChangeSetId}
                      busy={busy}
                      pendingAction={pendingAction}
                      onApproveEdit={onApproveEdit}
                      onRejectEdit={onRejectEdit}
                      onApproveReview={onApproveReview}
                      onSkipReview={onSkipReview}
                      commitPreview={commitPreview}
                      createdCommit={createdCommit}
                      onCreateCommit={onCreateCommit}
                      onOpenPlanner={() => setWorkspaceMode("planner")}
                    />
                  ) : null}

                  {!item.actionChangeSetId && item.needsWriteAccess ? (
                    <WriteAccessPanel busy={busy} onConnectGitHub={onConnectGitHub} />
                  ) : null}

                  {!item.actionChangeSetId &&
                  item.agentStatus === "redirect_required" &&
                  item.suggestedWorkspaceMode === "editor" ? (
                    <EditorRedirectPanel
                      path={item.suggestedPath}
                      busy={busy}
                      onOpenEditor={() => setWorkspaceMode("editor")}
                    />
                  ) : null}

                  {!item.actionChangeSetId &&
                  item.agentStatus === "redirect_required" &&
                  item.suggestedWorkspaceMode === "architecture" ? (
                    <ArchitectureRedirectPanel
                      busy={busy}
                      onOpenArchitecture={() => setWorkspaceMode("architecture")}
                    />
                  ) : null}

                  {/* Collapsible Source References */}
                  {item.sources.length > 0 ? (
                    <details className="mt-4 rounded-xl border border-line/20 bg-brand-sidebar/40 overflow-hidden">
                      <summary className="cursor-pointer px-4 py-2.5 text-xs font-semibold text-textSecondary hover:text-accent transition flex items-center gap-1.5">
                        🔍 Inspect Grounded Evidence
                      </summary>
                      <div className="grid gap-2 border-t border-line/10 p-3 bg-brand-sidebar/20">
                        {item.sources.map((source, index) => (
                          <details
                            key={`${item.id}:${source.file_path}:${source.start_line}:${source.end_line}:${index}`}
                            className="rounded-lg border border-line/15 bg-panel overflow-hidden"
                          >
                            <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-textPrimary hover:text-accent transition flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="rounded bg-accent-dim px-2 py-0.5 text-[10px] font-bold text-accent border border-accent/20">
                                  {index + 1}
                                </span>
                                <span className="break-all font-mono text-[11px] text-textSecondary">
                                  {source.file_path}
                                </span>
                              </div>
                              <span className="text-[10px] text-textMuted font-mono">
                                Lines {source.start_line} - {source.end_line}
                              </span>
                            </summary>
                            <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words border-t border-line/10 bg-brand-bg p-3 text-[11px] leading-relaxed text-textPrimary">
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

            {/* User Message Typing Loading State */}
            {pendingQuestion ? (
              <article className="space-y-4">
                <div className="ml-auto max-w-full rounded-2xl rounded-tr-none bg-accent border border-accent/25 px-4 py-3.5 text-sm text-white sm:max-w-[78%] shadow-lg shadow-accent/10">
                  <div className="mb-1 text-[10px] font-bold text-white/70 tracking-wider uppercase">
                    You just now
                  </div>
                  <p className="whitespace-pre-wrap leading-relaxed text-white">{pendingQuestion}</p>
                </div>
                <div className="max-w-full rounded-2xl rounded-tl-none border border-line/20 bg-panel px-4 py-4 text-sm sm:max-w-[88%] shadow-xl">
                  <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-textSecondary">
                    <img
                      src="/logo.jpg"
                      alt="RepoMind"
                      className="h-5 w-5 rounded-md border border-line/30 object-cover shadow-sm animate-pulse"
                    />
                    <span className="font-bold tracking-wide text-textPrimary">RepoMind AI</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-textSecondary py-1 font-medium">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-accent" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-accent [animation-delay:0.2s]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-accent [animation-delay:0.4s]" />
                    <span className="text-xs">Reasoning over vector index chunks...</span>
                  </div>
                </div>
              </article>
            ) : null}
            <div ref={messagesEndRef} />
          </div>
        ) : (
          /* Empty Chat Area */
          <div className="flex h-full items-center justify-center text-center p-6">
            <div className="max-w-md rounded-2xl border border-dashed border-line/20 bg-panel p-6 sm:p-8 shadow-xl">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 border border-accent/20 text-accent mb-4 shadow-lg shadow-accent/5">
                <Sparkles size={28} />
              </div>
              <h3 className="text-base font-bold text-textPrimary">
                {selectedProject
                  ? selectedChat
                    ? "Interactive Code Chat Ready"
                    : "No active thread selected"
                  : "Workspace empty"}
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-textSecondary">
                {selectedProject
                  ? selectedChat
                    ? "RepoMind is fully indexed and ready to assist you. Ask any codebase questions, locate files, or prompt for automated edit changesets."
                    : "Create a new chat thread in the project sidebar to start asking questions."
                  : "Clone or select a repository from the sidebar workspace to load the AI code mind."}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Input Form Footer */}
      <form className="border-t border-line/10 pt-4" onSubmit={onChat}>
        <div className="mb-2.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] font-medium text-textSecondary">
            {isProjectBusy
              ? "Indexing files in ChromaDB..."
              : isProjectFailed
                ? "This repository workspace has failed indexing. Please re-index."
                : "⌨️ Prompt edits naturally. The agent will prepare a diff preview before changes are written."}
          </p>
          <label className="flex items-center gap-2 text-xs font-semibold text-textSecondary">
            <Globe size={13} className="text-accent" />
            <span>Response Language:</span>
            <select
              className="rounded-lg border border-line/50 bg-brand-bg px-2.5 py-1 text-xs text-ink outline-none focus:border-accent cursor-pointer transition"
              value={responseLanguage}
              onChange={(event) => setResponseLanguage(event.target.value)}
            >
              <option value="auto">Automatic (detect)</option>
              <option value="en">English</option>
              <option value="hi">Hindi</option>
              <option value="bn">Bengali</option>
              <option value="ta">Tamil</option>
              <option value="te">Telugu</option>
              <option value="mr">Marathi</option>
              <option value="gu">Gujarati</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
              <option value="de">German</option>
              <option value="pt">Portuguese</option>
              <option value="ar">Arabic</option>
              <option value="zh">Chinese</option>
              <option value="ja">Japanese</option>
              <option value="ko">Korean</option>
            </select>
          </label>
        </div>
        <div className="flex gap-2">
          <textarea
            className="min-h-16 flex-1 resize-none rounded-xl border border-line/50 bg-brand-bg px-4 py-3 text-xs text-ink placeholder-textMuted outline-none focus:border-accent transition sm:min-h-20 sm:text-sm"
            placeholder={placeholder}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            disabled={!canAsk || busy}
            required
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <button
            className="flex h-16 w-16 items-center justify-center rounded-xl bg-accent text-white shadow-lg shadow-accent/20 transition-all hover:bg-accent-light hover:shadow-accent/40 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed sm:h-20 sm:w-20"
            disabled={busy || !canAsk}
            type="submit"
          >
            {pendingAction === "ask" ? (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              <Send size={18} />
            )}
          </button>
        </div>
      </form>
    </>
  );
}

type WriteAccessPanelProps = {
  busy: boolean;
  onConnectGitHub: () => void;
};

function WriteAccessPanel({ busy, onConnectGitHub }: WriteAccessPanelProps) {
  return (
    <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-dim p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-amber-500">🔒 GitHub Write Permissions Required</p>
          <p className="mt-1 text-xs leading-relaxed text-amber-600">
            To apply agentic code edits, we need write permissions for this repository.
            Connect your GitHub account now to continue.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-xs font-semibold text-white shadow hover:bg-amber-500 transition disabled:opacity-50"
          onClick={onConnectGitHub}
          disabled={busy}
        >
          <ExternalLink size={14} />
          Authorize GitHub Write
        </button>
      </div>
    </div>
  );
}

type ArchitectureRedirectPanelProps = {
  busy: boolean;
  onOpenArchitecture: () => void;
};

function ArchitectureRedirectPanel({ busy, onOpenArchitecture }: ArchitectureRedirectPanelProps) {
  return (
    <div className="mt-4 rounded-xl border border-accent/30 bg-accent-dim p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-accent">🗺️ Codebase Map Discovered</p>
          <p className="mt-1 text-xs leading-relaxed text-textSecondary">
            The interactive visual representation of the project is compiled and ready for review.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-xs font-semibold text-white shadow hover:bg-accent-light transition disabled:opacity-50"
          onClick={onOpenArchitecture}
          disabled={busy}
        >
          <ExternalLink size={14} />
          View Architecture Map
        </button>
      </div>
    </div>
  );
}

type EditorRedirectPanelProps = {
  path?: string | null;
  busy: boolean;
  onOpenEditor: () => void;
};

function EditorRedirectPanel({ path, busy, onOpenEditor }: EditorRedirectPanelProps) {
  return (
    <div className="mt-4 rounded-xl border border-line/30 bg-brand-sidebar/40 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-textPrimary">✏️ Open Manual Code Editor</p>
          <p className="mt-1 text-xs leading-relaxed text-textSecondary">
            {path
              ? `Let's make changes inside the file explorer for "${path}".`
              : "Open the file editor panel to select, inspect, and safely revise files."}
          </p>
        </div>
        <button
          type="button"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-800 px-4 py-2.5 text-xs font-semibold text-white shadow hover:bg-zinc-700 hover:text-white transition disabled:opacity-50"
          onClick={onOpenEditor}
          disabled={busy}
        >
          <ExternalLink size={14} />
          Launch Code Editor
        </button>
      </div>
    </div>
  );
}

type AgentActionPanelProps = {
  changeSet: EditChangeSet;
  isPlannerChangeSet: boolean;
  busy: boolean;
  pendingAction: string;
  onApproveEdit: () => void;
  onRejectEdit: () => void;
  onApproveReview: () => void;
  onSkipReview: () => void;
  commitPreview: CommitAssistantPreview | null;
  createdCommit: CreatedCommit | null;
  onCreateCommit: () => void;
  onOpenPlanner: () => void;
};

function AgentActionPanel({
  changeSet,
  isPlannerChangeSet,
  busy,
  pendingAction,
  onApproveEdit,
  onRejectEdit,
  onApproveReview,
  onSkipReview,
  commitPreview,
  createdCommit,
  onCreateCommit,
  onOpenPlanner,
}: AgentActionPanelProps) {
  return (
    <div className="mt-4 rounded-xl border border-line/30 bg-panel p-4 space-y-4 shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-accent">🔬 Change Set Draft Prepared</p>
          <p className="text-xs text-textSecondary">
            The coding assistant drafted the edits. Preview the git diff and approve below.
          </p>
        </div>
        <span className="rounded-full bg-accent-dim px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent border border-accent/20">
          Status: {changeSet.status.replace("_", " ")}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {changeSet.files.map((file) => (
          <span
            key={file}
            className="rounded bg-brand-bg border border-line/20 px-2 py-0.5 font-mono text-[10px] text-textSecondary"
          >
            📄 {file}
          </span>
        ))}
      </div>

      <details className="rounded-lg border border-line/20 bg-brand-bg overflow-hidden">
        <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-textSecondary hover:text-accent transition">
          🔎 Preview Git Diff
        </summary>
        <pre className="max-h-80 overflow-auto border-t border-line/10 bg-brand-bg p-3 text-[11px] leading-relaxed text-textPrimary font-mono">
          <code>{changeSet.diff || "No changes registered in the diff."}</code>
        </pre>
      </details>

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-line/30 bg-panel px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 hover:text-white transition disabled:opacity-50"
          onClick={onOpenPlanner}
          disabled={busy}
        >
          <ExternalLink size={13} />
          Explore Details
        </button>

        {changeSet.status === "pending" && (
          <>
            <button
              type="button"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white shadow hover:bg-accent-light transition disabled:opacity-50"
              onClick={onApproveEdit}
              disabled={busy || !isPlannerChangeSet}
            >
              <Check size={13} />
              {pendingAction === "planner-automation" ? "Applying edits..." : "Approve & Apply Edits"}
            </button>
            <button
              type="button"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-900/30 bg-red-950/20 px-3 py-2 text-xs font-semibold text-red-400 hover:bg-red-600 hover:text-white transition disabled:opacity-50"
              onClick={onRejectEdit}
              disabled={busy}
            >
              <X size={13} />
              {pendingAction === "edit-reject" ? "Rejecting..." : "Discard Diff"}
            </button>
          </>
        )}

        {changeSet.status === "applied" && (
          <>
            <button
              type="button"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white shadow hover:bg-accent-light transition disabled:opacity-50"
              onClick={onApproveReview}
              disabled={busy || !isPlannerChangeSet}
            >
              <Check size={13} />
              {pendingAction === "planner-review" ? "Running review..." : "Run AI Code Review"}
            </button>
            <button
              type="button"
              className="rounded-lg border border-line/30 bg-panel px-3 py-2 text-xs font-semibold text-zinc-400 hover:bg-zinc-850 hover:text-white transition disabled:opacity-50"
              onClick={onSkipReview}
              disabled={busy}
            >
              Skip Code Review
            </button>
          </>
        )}
      </div>

      {changeSet.status === "applied" && commitPreview?.has_changes && (
        <div className="mt-3 rounded-lg border border-line/20 bg-brand-bg p-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/10 pb-2">
            <div>
              <p className="text-xs font-bold text-textPrimary">🚀 Commit Assistant Draft</p>
              <p className="text-[10px] text-textMuted">
                Pushes changes directly to GitHub remote repository.
              </p>
            </div>
            {createdCommit && (
              <span className="rounded-full bg-emerald-dim text-emerald-500 border border-emerald-500/20 px-2.5 py-0.5 text-[10px] font-bold">
                ✓ Pushed {createdCommit.commit_hash.slice(0, 7)}
              </span>
            )}
          </div>
          <div className="rounded bg-panel border border-line/15 p-2 font-mono text-[11px] leading-relaxed text-textPrimary whitespace-pre-wrap">
            {commitPreview.commit_message || "No commit message drafted."}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white shadow hover:bg-accent-light transition disabled:opacity-50"
              onClick={onCreateCommit}
              disabled={busy || Boolean(createdCommit) || !commitPreview.commit_message.trim()}
            >
              {pendingAction === "create-commit" ? "Pushed..." : createdCommit ? "Pushed" : "Approve & Push Commit"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

