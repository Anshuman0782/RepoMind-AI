"use client";

import { FormEvent } from "react";
import { CommitAssistantPreview, CreatedCommit, EditChangeSet } from "@/lib/api";
import { ChatMessage } from "../types";
import { LatestSavedResult } from "./LatestSavedResult";

type PlannerViewProps = {
  selectedProjectId: string;
  busy: boolean;
  pendingAction: string;
  plannerPrompt: string;
  activeEditChangeSet: EditChangeSet | null;
  plannerChangeSetId: string;
  plannerAutomationPrompt: string;
  plannerAutomationStatus: string;
  commitPreview: CommitAssistantPreview | null;
  createdCommit: CreatedCommit | null;
  currentMessages: ChatMessage[];
  setPlannerPrompt: (value: string) => void;
  setCommitMessage: (value: string) => void;
  setPrTitle: (value: string) => void;
  setPrDescription: (value: string) => void;
  onChangePlan: (event: FormEvent<HTMLFormElement>) => void;
  onApproveEdit: () => void;
  onCreateCommit: () => void;
  onRejectEdit: () => void;
  onApproveReview: () => void;
  onSkipReview: () => void;
};

export function PlannerView({
  selectedProjectId,
  busy,
  pendingAction,
  plannerPrompt,
  activeEditChangeSet,
  plannerChangeSetId,
  plannerAutomationPrompt,
  plannerAutomationStatus,
  commitPreview,
  createdCommit,
  currentMessages,
  setPlannerPrompt,
  setCommitMessage,
  setPrTitle,
  setPrDescription,
  onChangePlan,
  onApproveEdit,
  onCreateCommit,
  onRejectEdit,
  onApproveReview,
  onSkipReview,
}: PlannerViewProps) {
  const hasPlannerChangeSet = activeEditChangeSet && activeEditChangeSet.id === plannerChangeSetId;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto py-4">
      <div className="mx-auto max-w-3xl rounded-md border border-line bg-white p-4 sm:p-5">
        <form className="space-y-3" onSubmit={onChangePlan}>
         <textarea
  className="min-h-36 w-full resize-none rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent"
  placeholder={`Ask Planner to create, edit, or delete files;
fix a bug;
refactor code;
generate README/API/setup/onboarding docs;
summarize architecture;
or explain a file/module...`}
  value={plannerPrompt}
  onChange={(event) => setPlannerPrompt(event.target.value)}
  disabled={!selectedProjectId || busy}
  required
/>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-5 text-zinc-500">
              Planner saves the plan, prepares agent handoffs when possible, and waits for your approval.
            </p>
            <button
              className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              disabled={busy || !selectedProjectId}
            >
              {pendingAction === "plan-change" ? "Planning..." : "Start planner"}
            </button>
          </div>
        </form>

        <div className="mt-5 rounded-md border border-line bg-panel p-3 text-sm text-zinc-600">
          Approval gate: Planner can prepare the right agent handoff, but local files change only after you approve.
        </div>

        {hasPlannerChangeSet ? (
          <div className="mt-3 rounded-md border border-accent/30 bg-accent/5 p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-ink">Planner agent flow ready</p>
                {plannerAutomationPrompt ? (
                  <p className="mt-1 text-xs font-medium text-zinc-700">Request: {plannerAutomationPrompt}</p>
                ) : null}
                <p className="mt-1 text-xs leading-5 text-zinc-600">
                  {plannerAutomationStatus ||
                    "Approve once to let Editor Agent apply this preview, then approve Review Agent separately."}
                </p>
              </div>
              <span className="rounded bg-white px-2 py-1 text-xs font-medium uppercase text-zinc-600">
                {activeEditChangeSet.status.replace("_", " ")}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {activeEditChangeSet.files.map((file) => (
                <span key={file} className="rounded bg-white px-2 py-1 text-xs text-zinc-700">
                  {file}
                </span>
              ))}
            </div>

            <pre className="mt-3 max-h-80 overflow-auto rounded-md bg-zinc-950 p-3 text-xs leading-5 text-zinc-100">
              <code>{activeEditChangeSet.diff || "No diff available."}</code>
            </pre>

            {activeEditChangeSet.status === "pending" ? (
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                  onClick={onApproveEdit}
                  disabled={busy}
                >
                  {pendingAction === "planner-automation" ? "Applying edit..." : "Approve edit"}
                </button>
                <button
                  type="button"
                  className="rounded-md border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-white disabled:opacity-60"
                  onClick={onRejectEdit}
                  disabled={busy}
                >
                  {pendingAction === "edit-reject" ? "Rejecting..." : "Reject plan"}
                </button>
              </div>
            ) : null}

            {activeEditChangeSet.status === "applied" ? (
              <div className="mt-3 space-y-3">
                {commitPreview?.has_changes ? (
                  <div className="rounded-md border border-line bg-white p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-ink">Commit Assistant draft</p>
                        <p className="mt-1 text-xs leading-5 text-zinc-600">
                          Generated from the current diff. Local commit still needs your approval.
                        </p>
                      </div>
                      {createdCommit ? (
                        <span className="rounded bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                          committed {createdCommit.commit_hash.slice(0, 8)}
                        </span>
                      ) : null}
                    </div>

                    <label className="mt-3 block text-xs font-semibold uppercase text-zinc-500" htmlFor="planner-commit-message">
                      Commit message
                    </label>
                    <textarea
                      id="planner-commit-message"
                      className="mt-2 min-h-24 w-full resize-none rounded-md border border-line px-3 py-2 font-mono text-xs leading-5 outline-none focus:border-accent"
                      value={commitPreview.commit_message}
                      onChange={(event) => setCommitMessage(event.target.value)}
                      disabled={busy || Boolean(createdCommit)}
                    />

                    <label className="mt-3 block text-xs font-semibold uppercase text-zinc-500" htmlFor="planner-pr-title">
                      PR title
                    </label>
                    <input
                      id="planner-pr-title"
                      className="mt-2 w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent"
                      value={commitPreview.pr_title}
                      onChange={(event) => setPrTitle(event.target.value)}
                      disabled={busy}
                    />

                    <label className="mt-3 block text-xs font-semibold uppercase text-zinc-500" htmlFor="planner-pr-description">
                      PR description
                    </label>
                    <textarea
                      id="planner-pr-description"
                      className="mt-2 min-h-36 w-full resize-none rounded-md border border-line px-3 py-2 text-sm leading-6 outline-none focus:border-accent"
                      value={commitPreview.pr_description}
                      onChange={(event) => setPrDescription(event.target.value)}
                      disabled={busy}
                    />

                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <button
                        type="button"
                        className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                        onClick={onCreateCommit}
                        disabled={busy || Boolean(createdCommit) || !commitPreview.commit_message.trim()}
                      >
                        {pendingAction === "create-commit" ? "Committing..." : createdCommit ? "Committed" : "Approve local commit"}
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                    onClick={onApproveReview}
                    disabled={busy}
                  >
                    {pendingAction === "planner-review" ? "Reviewing..." : "Approve Review Agent"}
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-white disabled:opacity-60"
                    onClick={onSkipReview}
                    disabled={busy}
                  >
                    Skip review
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <LatestSavedResult messages={currentMessages} />
      </div>
    </div>
  );
}
