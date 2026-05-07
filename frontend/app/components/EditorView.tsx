"use client";

import { FormEvent } from "react";
import { EditChangeSet, FileEditOperation } from "@/lib/api";

type EditorViewProps = {
  selectedProjectId: string;
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
  return (
    <div className="min-h-0 flex-1 overflow-y-auto py-4">
      <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <form className="rounded-md border border-line bg-white p-4 sm:p-5" onSubmit={onCreateEditPreview}>
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
              <p className="mt-1 text-xs text-zinc-500">Preview first, then apply only after approval.</p>
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
                      onClick={onApplyEdit}
                      disabled={busy}
                    >
                      {pendingAction === "edit-apply" ? "Applying..." : "Apply approved edit"}
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-panel disabled:opacity-60"
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
                    className="rounded-md border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
                    onClick={onRollbackEdit}
                    disabled={busy}
                  >
                    {pendingAction === "edit-rollback" ? "Rolling back..." : "Rollback change set"}
                  </button>
                ) : null}
              </div>

              {activeEditChangeSet.status === "applied" && reviewSuggestionFiles.length > 0 ? (
                <div className="rounded-md border border-accent/30 bg-accent/5 p-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-ink">Review this change?</p>
                      <p className="mt-1 text-xs leading-5 text-zinc-600">
                        RepoMind can inspect the applied diff and suggest tests before you commit.
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <button
                        type="button"
                        className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
                        onClick={onSuggestedCodeReview}
                        disabled={busy}
                      >
                        {pendingAction === "code-review" ? "Reviewing..." : "Review change"}
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-line px-3 py-2 text-sm font-medium text-ink hover:bg-panel disabled:opacity-60"
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
          ) : (
            <div className="mt-4 rounded-md border border-dashed border-line bg-panel p-5 text-sm leading-6 text-zinc-600">
              Create a preview to see the exact paths and diff before any local file is touched.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
