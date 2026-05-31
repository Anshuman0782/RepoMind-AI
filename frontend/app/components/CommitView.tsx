"use client";

import { FormEvent } from "react";
import { Check, GitCommitHorizontal, RefreshCw, FileDiff } from "lucide-react";
import { CommitAssistantPreview, CreatedCommit } from "@/lib/api";

type CommitViewProps = {
  selectedProjectId: string;
  canWrite: boolean;
  busy: boolean;
  pendingAction: string;
  commitContext: string;
  commitPreview: CommitAssistantPreview | null;
  createdCommit: CreatedCommit | null;
  setCommitContext: (value: string) => void;
  setCommitMessage: (value: string) => void;
  setPrTitle: (value: string) => void;
  setPrDescription: (value: string) => void;
  onPreviewCommit: (event: FormEvent<HTMLFormElement>) => void;
  onCreateCommit: () => void;
};

export function CommitView({
  selectedProjectId,
  canWrite,
  busy,
  pendingAction,
  commitContext,
  commitPreview,
  createdCommit,
  setCommitContext,
  setCommitMessage,
  setPrTitle,
  setPrDescription,
  onPreviewCommit,
  onCreateCommit,
}: CommitViewProps) {
  const hasPreview = Boolean(commitPreview?.has_changes);
  const controlsDisabled = !selectedProjectId || !canWrite || busy;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto py-4">
      <div className="mx-auto max-w-4xl space-y-5">
        {/* Context Drafting Card */}
        <form className="rounded-xl border border-line/20 bg-panel/30 p-5 shadow-xl backdrop-blur-md space-y-4" onSubmit={onPreviewCommit}>
          {!canWrite && selectedProjectId && (
            <div className="rounded-lg border border-amber-900/20 bg-amber-950/20 px-4 py-3 text-xs leading-relaxed text-amber-400">
              🔒 **Read-Only Mode**: Auth with GitHub in the sidebar to push commits. You can still preview drafted commit text.
            </div>
          )}

          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-textPrimary uppercase tracking-wider block" htmlFor="commit-context">
              🚀 Provide Commit & PR Context
            </label>
            {createdCommit && (
              <span className="rounded-full bg-emerald-dim text-emerald-500 border border-emerald-500/20 px-2.5 py-0.5 text-[10px] font-bold">
                ✓ Pushed {createdCommit.commit_hash.slice(0, 7)}
              </span>
            )}
          </div>

          <textarea
            id="commit-context"
            className="w-full resize-none rounded-xl border border-line/30 bg-brand-bg px-4 py-3 text-xs sm:text-sm text-ink placeholder-textMuted outline-none focus:border-accent transition min-h-24"
            placeholder="Optional context: core features completed, tickets closed, or release summaries..."
            value={commitContext}
            onChange={(event) => setCommitContext(event.target.value)}
            disabled={controlsDisabled}
          />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-textSecondary font-medium">
              💡 Drafts readable messages based on current workspace code diffs.
            </p>
            <button
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-xs font-semibold text-white shadow hover:bg-accent-light transition disabled:opacity-50"
              disabled={controlsDisabled}
            >
              <RefreshCw size={14} className={pendingAction === "commit-preview" ? "animate-spin" : ""} />
              {pendingAction === "commit-preview" ? "Scanning changes..." : "Draft Commit & PR"}
            </button>
          </div>
        </form>

        {commitPreview && !commitPreview.has_changes && (
          <div className="rounded-xl border border-line/10 bg-brand-bg p-5 text-center text-xs text-textSecondary italic">
            No uncommitted workspace changes detected in git log.
          </div>
        )}

        {/* Draft Display Panel */}
        {hasPreview && commitPreview && (
          <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            <div className="space-y-4">
              {/* Message Draft */}
              <section className="rounded-xl border border-line/20 bg-panel/30 p-5 space-y-3">
                <label className="text-xs font-bold text-textPrimary uppercase tracking-wider block" htmlFor="commit-message">
                  Drafted Commit Message
                </label>
                <textarea
                  id="commit-message"
                  className="w-full resize-none rounded-xl border border-line/30 bg-brand-bg px-4 py-3 text-xs font-mono text-ink outline-none focus:border-accent transition min-h-28"
                  value={commitPreview.commit_message}
                  onChange={(event) => setCommitMessage(event.target.value)}
                  disabled={busy}
                />
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-xs font-semibold text-white shadow hover:bg-accent-light transition disabled:opacity-50"
                  onClick={onCreateCommit}
                  disabled={busy || !canWrite || Boolean(createdCommit) || !commitPreview.commit_message.trim()}
                >
                  <GitCommitHorizontal size={14} />
                  {pendingAction === "create-commit" ? "Pushing commit..." : createdCommit ? "Pushed successfully" : "Push Commit to Remote"}
                </button>
              </section>
 
              {/* PR Title & Description */}
              <section className="rounded-xl border border-line/20 bg-panel/30 p-5 space-y-4">
                <div>
                  <label className="text-xs font-bold text-textPrimary uppercase tracking-wider block" htmlFor="pr-title">
                    Suggested PR Title
                  </label>
                  <input
                    id="pr-title"
                    className="mt-2 w-full rounded-lg border border-line/30 bg-brand-bg px-4 py-2 text-xs text-ink outline-none focus:border-accent transition"
                    value={commitPreview.pr_title}
                    onChange={(event) => setPrTitle(event.target.value)}
                    disabled={busy}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-textPrimary uppercase tracking-wider block" htmlFor="pr-description">
                    Suggested PR Body
                  </label>
                  <textarea
                    id="pr-description"
                    className="mt-2 w-full resize-none rounded-xl border border-line/30 bg-brand-bg px-4 py-3 text-xs text-ink outline-none focus:border-accent transition min-h-64"
                    value={commitPreview.pr_description}
                    onChange={(event) => setPrDescription(event.target.value)}
                    disabled={busy}
                  />
                </div>
              </section>
            </div>

            {/* Changed Files Summary Panel */}
            <aside className="space-y-4">
              <section className="rounded-xl border border-line/20 bg-brand-sidebar/40 p-4">
                <h3 className="text-xs font-bold text-textSecondary uppercase tracking-wider flex items-center gap-1.5 border-b border-line/10 pb-2">
                  <FileDiff size={14} className="text-accent" />
                  <span>Changed Files ({commitPreview.changed_files.length})</span>
                </h3>
                <div className="mt-2 max-h-52 overflow-y-auto divide-y divide-line/5 pr-1">
                  {commitPreview.changed_files.map((file) => (
                    <div key={file} className="py-2 text-[10px] font-mono text-textSecondary truncate" title={file}>
                      📄 {file}
                    </div>
                  ))}
                </div>
              </section>
 
              {createdCommit && (
                <section className="rounded-xl border border-emerald-500/20 bg-emerald-dim p-4 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-500">
                    <Check size={14} />
                    Commit Pushed Successfully
                  </div>
                  <div className="space-y-1 text-[10px] text-textSecondary font-mono">
                    <p>Hash: {createdCommit.commit_hash.slice(0, 16)}...</p>
                    <p>Remote: {createdCommit.remote}</p>
                    <p>Branch: {createdCommit.branch}</p>
                  </div>
                </section>
              )}
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}

