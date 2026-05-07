"use client";

import { FormEvent } from "react";
import { Check, GitCommitHorizontal, RefreshCw } from "lucide-react";
import { CommitAssistantPreview, CreatedCommit } from "@/lib/api";

type CommitViewProps = {
  selectedProjectId: string;
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

  return (
    <div className="min-h-0 flex-1 overflow-y-auto py-4">
      <div className="mx-auto max-w-4xl space-y-4">
        <form className="rounded-md border border-line bg-white p-4 sm:p-5" onSubmit={onPreviewCommit}>
          <label className="text-sm font-semibold text-ink" htmlFor="commit-context">
            Commit context
          </label>
          <textarea
            id="commit-context"
            className="mt-2 min-h-28 w-full resize-none rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent"
            placeholder="Optional: what changed, issue number, release note, or testing you already ran..."
            value={commitContext}
            onChange={(event) => setCommitContext(event.target.value)}
            disabled={!selectedProjectId || busy}
          />
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-5 text-zinc-500">
              Preview reads the current diff and drafts commit and PR copy. GitHub push remains a separate approval.
            </p>
            <button
              className="inline-flex items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              disabled={busy || !selectedProjectId}
            >
              <RefreshCw size={16} />
              {pendingAction === "commit-preview" ? "Drafting..." : "Draft"}
            </button>
          </div>
        </form>

        {commitPreview && !commitPreview.has_changes ? (
          <div className="rounded-md border border-line bg-panel p-4 text-sm text-zinc-600">
            No uncommitted changes found.
          </div>
        ) : null}

        {hasPreview && commitPreview ? (
          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <div className="space-y-4">
              <section className="rounded-md border border-line bg-white p-4">
                <label className="text-sm font-semibold text-ink" htmlFor="commit-message">
                  Commit message
                </label>
                <textarea
                  id="commit-message"
                  className="mt-2 min-h-28 w-full resize-none rounded-md border border-line px-3 py-2 font-mono text-sm outline-none focus:border-accent"
                  value={commitPreview.commit_message}
                  onChange={(event) => setCommitMessage(event.target.value)}
                  disabled={busy}
                />
                <button
                  type="button"
                  className="mt-3 inline-flex items-center justify-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                  onClick={onCreateCommit}
                  disabled={busy || Boolean(createdCommit) || !commitPreview.commit_message.trim()}
                >
                  <GitCommitHorizontal size={16} />
                  {pendingAction === "create-commit" ? "Pushing..." : createdCommit ? "Pushed" : "Commit and push"}
                </button>
              </section>

              <section className="rounded-md border border-line bg-white p-4">
                <label className="text-sm font-semibold text-ink" htmlFor="pr-title">
                  PR title
                </label>
                <input
                  id="pr-title"
                  className="mt-2 w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent"
                  value={commitPreview.pr_title}
                  onChange={(event) => setPrTitle(event.target.value)}
                  disabled={busy}
                />
                <label className="mt-4 block text-sm font-semibold text-ink" htmlFor="pr-description">
                  PR description
                </label>
                <textarea
                  id="pr-description"
                  className="mt-2 min-h-64 w-full resize-none rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent"
                  value={commitPreview.pr_description}
                  onChange={(event) => setPrDescription(event.target.value)}
                  disabled={busy}
                />
              </section>
            </div>

            <aside className="space-y-4">
              <section className="rounded-md border border-line bg-panel p-4">
                <h3 className="text-sm font-semibold text-ink">Changed files</h3>
                <div className="mt-3 max-h-52 overflow-y-auto text-xs text-zinc-600">
                  {commitPreview.changed_files.map((file) => (
                    <div key={file} className="border-b border-line py-2 last:border-b-0">
                      {file}
                    </div>
                  ))}
                </div>
              </section>

              {createdCommit ? (
                <section className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                  <div className="flex items-center gap-2 font-semibold">
                    <Check size={16} />
                    Commit pushed
                  </div>
                  <p className="mt-2 font-mono text-xs">{createdCommit.commit_hash.slice(0, 12)}</p>
                  <p className="mt-1 text-xs">
                    {createdCommit.remote}/{createdCommit.branch}
                  </p>
                </section>
              ) : null}
            </aside>
          </div>
        ) : null}
      </div>
    </div>
  );
}
