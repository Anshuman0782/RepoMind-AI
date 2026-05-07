"use client";

import { FormEvent } from "react";
import { ChatMessage } from "../types";
import { LatestSavedResult } from "./LatestSavedResult";

type ReviewViewProps = {
  selectedProjectId: string;
  busy: boolean;
  pendingAction: string;
  reviewPrompt: string;
  currentMessages: ChatMessage[];
  setReviewPrompt: (value: string) => void;
  onCodeReview: (event: FormEvent<HTMLFormElement>) => void;
};

export function ReviewView({
  selectedProjectId,
  busy,
  pendingAction,
  reviewPrompt,
  currentMessages,
  setReviewPrompt,
  onCodeReview,
}: ReviewViewProps) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto py-4">
      <div className="mx-auto max-w-3xl rounded-md border border-line bg-white p-4 sm:p-5">
        <form className="space-y-3" onSubmit={onCodeReview}>
          <textarea
            className="min-h-36 w-full resize-none rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent"
            placeholder="Optional: describe the changed feature, risk area, or test focus..."
            value={reviewPrompt}
            onChange={(event) => setReviewPrompt(event.target.value)}
            disabled={!selectedProjectId || busy}
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-5 text-zinc-500">
              Reviews inspect the current git diff and save findings into chat.
            </p>
            <button
              className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              disabled={busy || !selectedProjectId}
            >
              {pendingAction === "code-review" ? "Reviewing..." : "Review changes"}
            </button>
          </div>
        </form>

        <div className="mt-5 rounded-md border border-line bg-panel p-3 text-sm text-zinc-600">
          Test commands are suggested only; run them after you approve the check.
        </div>

        <LatestSavedResult messages={currentMessages} />
      </div>
    </div>
  );
}
