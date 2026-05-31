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
      <div className="mx-auto max-w-3xl glass-panel shadow-2xl rounded-2xl p-6 sm:p-8 border border-line/40 backdrop-blur-md">
        <form className="space-y-4" onSubmit={onChangePlan}>
          <textarea
            className="min-h-36 w-full resize-none rounded-xl border border-line/60 bg-brand-bg text-ink placeholder-textMuted px-4 py-3 text-sm focus:border-accent focus:ring-2 focus:ring-accent/10 transition-all duration-200 outline-none backdrop-blur-sm"
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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-relaxed text-textSecondary max-w-md">
              Planner saves the plan, prepares agent handoffs when possible, and waits for your approval.
            </p>
            <button
              className="rounded-xl bg-accent text-white px-5 py-2.5 text-sm font-semibold shadow-lg shadow-accent/25 hover:bg-accent-light transition duration-200 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
              disabled={busy || !selectedProjectId}
            >
              {pendingAction === "plan-change" ? "Planning..." : "Start planner"}
            </button>
          </div>
        </form>

        <div className="mt-5 rounded-xl border border-line/40 bg-brand-sidebar/40 p-4 text-xs sm:text-sm text-textSecondary flex items-center gap-2">
          <span>🛡️</span>
          <span>Approval gate: Planner can prepare the right agent handoff, but local files change only after you approve.</span>
        </div>

        {hasPlannerChangeSet ? (
          <div className="mt-5 rounded-xl border border-accent/20 bg-accent-dim p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-bold text-textPrimary">Planner agent flow ready</p>
                {plannerAutomationPrompt ? (
                  <p className="mt-2 text-xs font-semibold text-textPrimary bg-brand-bg/80 px-2.5 py-1 rounded-md border border-line/30 mt-2 inline-block">
                    Request: {plannerAutomationPrompt}
                  </p>
                ) : null}
                <p className="mt-2 text-xs leading-relaxed text-textSecondary">
                  {plannerAutomationStatus ||
                    "Approve once to let Editor Agent apply this preview, then approve Review Agent separately."}
                </p>
              </div>
              <span className="rounded-full bg-accent-dim border border-accent/30 px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent self-start">
                {activeEditChangeSet.status.replace("_", " ")}
              </span>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {activeEditChangeSet.files.map((file) => (
                <span key={file} className="rounded-md border border-line/30 bg-brand-bg px-2.5 py-1 text-[11px] font-mono text-textSecondary hover:border-accent/40 transition">
                  {file}
                </span>
              ))}
            </div>

            <pre className="mt-4 max-h-80 overflow-auto rounded-xl border border-line/30 bg-brand-bg p-4 font-mono text-[11px] leading-relaxed text-textPrimary">
              <code>{activeEditChangeSet.diff || "No diff available."}</code>
            </pre>

            {activeEditChangeSet.status === "pending" ? (
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-accent/25 hover:bg-accent-light transition duration-200 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                  onClick={onApproveEdit}
                  disabled={busy}
                >
                  {pendingAction === "planner-automation" ? "Applying edit..." : "Approve edit"}
                </button>
                <button
                  type="button"
                  className="rounded-xl border border-line bg-transparent px-5 py-2.5 text-sm font-semibold text-textSecondary hover:bg-line/20 hover:text-ink transition duration-200 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                  onClick={onRejectEdit}
                  disabled={busy}
                >
                  {pendingAction === "edit-reject" ? "Rejecting..." : "Reject plan"}
                </button>
              </div>
            ) : null}

            {activeEditChangeSet.status === "applied" ? (
              <div className="mt-4 space-y-4">
                {commitPreview?.has_changes ? (
                  <div className="rounded-xl border border-line/30 bg-brand-bg p-4 sm:p-5 backdrop-blur-sm shadow">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm font-bold text-textPrimary">Commit Assistant draft</p>
                        <p className="mt-1 text-xs text-textSecondary">
                          Generated from the current diff. GitHub push still needs your approval.
                        </p>
                      </div>
                      {createdCommit ? (
                        <span className="rounded-full bg-emerald-dim border border-emerald-500/30 px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-500">
                          pushed {createdCommit.commit_hash.slice(0, 8)}
                        </span>
                      ) : null}
                    </div>
 
                    <div className="mt-4 space-y-4">
                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-wider text-textMuted block" htmlFor="planner-commit-message">
                          Commit message
                        </label>
                        <textarea
                          id="planner-commit-message"
                          className="mt-2 min-h-24 w-full resize-none rounded-xl border border-line/60 bg-brand-bg text-ink placeholder-textMuted px-4 py-2.5 font-mono text-xs leading-relaxed outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-all"
                          value={commitPreview.commit_message}
                          onChange={(event) => setCommitMessage(event.target.value)}
                          disabled={busy || Boolean(createdCommit)}
                        />
                      </div>
 
                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-wider text-textMuted block" htmlFor="planner-pr-title">
                          PR title
                        </label>
                        <input
                          id="planner-pr-title"
                          className="mt-2 w-full rounded-xl border border-line/60 bg-brand-bg text-ink placeholder-textMuted px-4 py-2.5 text-xs outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-all"
                          value={commitPreview.pr_title}
                          onChange={(event) => setPrTitle(event.target.value)}
                          disabled={busy}
                        />
                      </div>
 
                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-wider text-textMuted block" htmlFor="planner-pr-description">
                          PR description
                        </label>
                        <textarea
                          id="planner-pr-description"
                          className="mt-2 min-h-36 w-full resize-none rounded-xl border border-line/60 bg-brand-bg text-ink placeholder-textMuted px-4 py-2.5 text-xs leading-relaxed outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-all"
                          value={commitPreview.pr_description}
                          onChange={(event) => setPrDescription(event.target.value)}
                          disabled={busy}
                        />
                      </div>
                    </div>

                    <div className="mt-4">
                      <button
                        type="button"
                        className="rounded-xl bg-emerald-600 hover:bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-950/40 transition duration-200 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                        onClick={onCreateCommit}
                        disabled={busy || Boolean(createdCommit) || !commitPreview.commit_message.trim()}
                      >
                        {pendingAction === "create-commit" ? "Pushing..." : createdCommit ? "Pushed" : "Approve commit and push"}
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="flex flex-col gap-2 sm:flex-row pt-2">
                  <button
                    type="button"
                    className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-accent/25 hover:bg-accent-light transition duration-200 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                    onClick={onApproveReview}
                    disabled={busy}
                  >
                    {pendingAction === "planner-review" ? "Reviewing..." : "Approve Review Agent"}
                  </button>
                  <button
                    type="button"
                    className="rounded-xl border border-line bg-transparent px-5 py-2.5 text-sm font-semibold text-textSecondary hover:bg-line/20 hover:text-ink transition duration-200 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
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
