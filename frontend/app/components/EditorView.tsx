"use client";

import { FormEvent } from "react";
import { EditChangeSet, FileEditOperation } from "@/lib/api";

type EditorViewProps = {
  selectedProjectId: string;
  canWrite: boolean;
  busy: boolean;
  pendingAction: string;
  editAction: FileEditOperation["action"];
  editFilePath: string;
  editContent: string;
  activeEditChangeSet: EditChangeSet | null;
  loadingEditFilePath: string;
  reviewSuggestionFiles: string[];
  setEditAction: (action: FileEditOperation["action"]) => void;
  setEditFilePath: (path: string) => void;
  setEditContent: (content: string) => void;
  setActiveEditChangeSet: (changeSet: EditChangeSet | null) => void;
  clearReviewSuggestion: () => void;
  loadEditorFileContent: (path?: string, forceEdit?: boolean) => Promise<void>;
  onCreateEditPreview: (event: FormEvent<HTMLFormElement>) => void;
  onApplyEdit: () => void;
  onRejectEdit: () => void;
  onRollbackEdit: () => void;
  onSuggestedCodeReview: () => void;
};

export function EditorView({
  selectedProjectId,
  canWrite,
  busy,
  pendingAction,
  editAction,
  editFilePath,
  editContent,
  activeEditChangeSet,
  loadingEditFilePath,
  reviewSuggestionFiles,
  setEditAction,
  setEditFilePath,
  setEditContent,
  setActiveEditChangeSet,
  clearReviewSuggestion,
  loadEditorFileContent,
  onCreateEditPreview,
  onApplyEdit,
  onRejectEdit,
  onRollbackEdit,
  onSuggestedCodeReview,
}: EditorViewProps) {
  const controlsDisabled = !selectedProjectId || !canWrite || busy;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto py-4">
      <div className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <form className="glass-panel shadow-2xl rounded-2xl p-5 border border-line/40 backdrop-blur-md flex flex-col justify-between" onSubmit={onCreateEditPreview}>
          <div className="space-y-4">
            {!canWrite && selectedProjectId ? (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs sm:text-sm leading-relaxed text-amber-300">
                ⚠️ This repo is read-only. Connect GitHub with write access before creating, editing, deleting,
                applying, or rolling back files.
              </div>
            ) : null}
            
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-textMuted">Action</label>
              <div className="mt-2 grid grid-cols-3 rounded-xl border border-line/55 bg-brand-sidebar p-1 text-xs sm:text-sm font-medium">
                {(["edit", "create", "delete"] as const).map((action) => (
                  <button
                    key={action}
                    type="button"
                    className={`rounded-lg px-3 py-2 font-semibold capitalize transition-all duration-200 ${
                      editAction === action 
                        ? "bg-accent text-white shadow-lg shadow-accent/20" 
                        : "text-textSecondary hover:text-ink hover:bg-line/20"
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
              <label className="text-[10px] font-bold uppercase tracking-wider text-textMuted" htmlFor="edit-file-path">
                File path
              </label>
              <input
                id="edit-file-path"
                className="mt-2 w-full rounded-xl border border-line/60 bg-brand-bg text-ink placeholder-textMuted px-4 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-all duration-200 font-mono"
                placeholder="src/example.ts"
                value={editFilePath}
                onChange={(event) => {
                  setEditFilePath(event.target.value);
                  setActiveEditChangeSet(null);
                }}
                onBlur={() => {
                  void loadEditorFileContent();
                }}
                disabled={controlsDisabled}
                required
              />
            </div>

            {editAction !== "delete" ? (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-textMuted" htmlFor="edit-content">
                    Full file content
                  </label>
                  {editAction === "edit" ? (
                    <button
                      type="button"
                      className="rounded-lg border border-line/65 bg-transparent px-3 py-1 text-xs font-semibold text-textSecondary hover:bg-line/20 hover:text-ink transition duration-200 disabled:opacity-60"
                      onClick={() => {
                        void loadEditorFileContent();
                      }}
                      disabled={controlsDisabled || !editFilePath.trim()}
                    >
                      {loadingEditFilePath ? "Loading..." : "Load current file"}
                    </button>
                  ) : null}
                </div>
                <textarea
                  id="edit-content"
                  className="mt-1 min-h-80 w-full resize-y rounded-xl border border-line/60 bg-brand-bg text-ink placeholder-textMuted px-4 py-3 font-mono text-[11px] leading-relaxed outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-all duration-200"
                  placeholder={
                    editAction === "edit"
                      ? "Enter a file path above to load the current file..."
                      : "Paste or write the complete file content to preview..."
                  }
                  value={editContent}
                  onChange={(event) => setEditContent(event.target.value)}
                  disabled={controlsDisabled || Boolean(loadingEditFilePath)}
                  required
                />
              </div>
            ) : null}
          </div>

          <div className="mt-5">
            <button
              className="w-full rounded-xl bg-accent text-white px-5 py-2.5 text-sm font-semibold shadow-lg shadow-accent/25 hover:bg-accent-light transition duration-200 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
              disabled={controlsDisabled}
            >
              {pendingAction === "edit-preview" ? "Creating preview..." : "Preview diff"}
            </button>
          </div>
        </form>

        <div className="glass-panel shadow-2xl rounded-2xl p-5 border border-line/40 backdrop-blur-md flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/20 pb-4">
            <div>
              <h3 className="text-sm font-bold text-textPrimary">Change set</h3>
              <p className="mt-1 text-xs text-textSecondary">Preview first, then apply only after approval.</p>
            </div>
            {activeEditChangeSet ? (
              <span className="rounded-full bg-accent-dim border border-accent/30 px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent">
                {activeEditChangeSet.status.replace("_", " ")}
              </span>
            ) : null}
          </div>

          {activeEditChangeSet ? (
            <div className="mt-4 flex-1 flex flex-col justify-between space-y-4">
              <div className="space-y-4">
                <div className="rounded-xl border border-line/30 bg-brand-sidebar/45 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-textMuted">Proposed files</p>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {activeEditChangeSet.files.map((file) => (
                      <span key={file} className="rounded-md border border-line/30 bg-panel px-2.5 py-1 text-[11px] font-mono text-textSecondary hover:border-accent/40 transition">
                        {file}
                      </span>
                    ))}
                  </div>
                </div>

                <pre className="max-h-[350px] overflow-auto rounded-xl border border-line/30 bg-brand-bg p-4 font-mono text-[11px] leading-relaxed text-textPrimary">
                  <code>{activeEditChangeSet.diff || "No diff available."}</code>
                </pre>
              </div>

              <div className="space-y-4 pt-2">
                <div className="flex flex-col gap-2 sm:flex-row">
                  {activeEditChangeSet.status === "pending" ? (
                    <>
                      <button
                        type="button"
                        className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-accent/25 hover:bg-accent-light transition duration-200 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex-1"
                        onClick={onApplyEdit}
                        disabled={busy || !canWrite}
                      >
                        {pendingAction === "edit-apply" ? "Applying..." : "Apply approved edit"}
                      </button>
                      <button
                        type="button"
                        className="rounded-xl border border-line bg-transparent px-5 py-2.5 text-sm font-semibold text-textSecondary hover:bg-line/20 hover:text-ink transition duration-200 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                        onClick={onRejectEdit}
                        disabled={busy}
                      >
                        {pendingAction === "edit-reject" ? "Rejecting..." : "Reject"}
                      </button>
                    </>
                  ) : null}
                  {activeEditChangeSet.status === "applied" ? (
                    <button
                      type="button"
                      className="rounded-xl border border-red-500/30 bg-transparent px-5 py-2.5 text-sm font-semibold text-red-400 hover:bg-red-500/10 transition duration-200 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed w-full"
                      onClick={onRollbackEdit}
                      disabled={busy || !canWrite}
                    >
                      {pendingAction === "edit-rollback" ? "Rolling back..." : "Rollback change set"}
                    </button>
                  ) : null}
                </div>

                {activeEditChangeSet.status === "applied" && reviewSuggestionFiles.length > 0 ? (
                  <div className="rounded-xl border border-accent/20 bg-accent-dim p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-bold text-accent">🔬 Review this change?</p>
                        <p className="mt-1 text-xs text-textSecondary leading-relaxed">
                          RepoMind can inspect the applied diff and suggest tests before you commit.
                        </p>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <button
                          type="button"
                          className="rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-accent/20 hover:bg-accent-light transition duration-200 active:scale-[0.98] disabled:opacity-40"
                          onClick={onSuggestedCodeReview}
                          disabled={busy}
                        >
                          {pendingAction === "code-review" ? "Reviewing..." : "Review change"}
                        </button>
                        <button
                          type="button"
                          className="rounded-xl border border-line bg-transparent px-4 py-2 text-xs font-semibold text-textSecondary hover:bg-line/20 hover:text-ink transition duration-200 active:scale-[0.98] disabled:opacity-40"
                          onClick={clearReviewSuggestion}
                          disabled={busy}
                        >
                          Ignore
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="mt-6 flex-1 flex items-center justify-center rounded-xl border border-dashed border-line/40 bg-brand-bg/40 p-6 text-xs sm:text-sm text-textSecondary text-center leading-relaxed">
              Create a preview to see the exact paths and diff before any local file is touched.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
