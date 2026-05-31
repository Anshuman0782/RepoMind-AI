"use client";

import { FormEvent } from "react";
import { ChatMessage } from "../types";
import { LatestSavedResult } from "./LatestSavedResult";
import { ShieldAlert, BookOpen } from "lucide-react";

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
      <div className="mx-auto max-w-3xl rounded-xl border border-line/20 bg-panel/30 p-5 shadow-xl backdrop-blur-md space-y-4">
        {/* Title Indicator */}
        <div className="flex items-center gap-2 px-1 text-textPrimary font-bold text-sm">
          <ShieldAlert size={16} className="text-accent" />
          <span>Launch AI Code Review</span>
        </div>

        {/* Input Form */}
        <form className="space-y-4" onSubmit={onCodeReview}>
          <textarea
            className="min-h-36 w-full resize-none rounded-xl border border-line/30 bg-brand-bg px-4 py-3 text-xs sm:text-sm text-ink placeholder-textMuted outline-none focus:border-accent transition"
            placeholder="Optional context: focus area, regression concerns, or specific files..."
            value={reviewPrompt}
            onChange={(event) => setReviewPrompt(event.target.value)}
            disabled={!selectedProjectId || busy}
          />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-textSecondary font-medium">
              💡 Code reviews scan uncommitted git diffs and persist warnings in chat.
            </p>
            <button
              className="rounded-lg bg-accent px-4 py-2.5 text-xs font-semibold text-white shadow hover:bg-accent-light transition disabled:opacity-50"
              disabled={busy || !selectedProjectId}
            >
              {pendingAction === "code-review" ? "Analyzing diff..." : "Trigger Code Review"}
            </button>
          </div>
        </form>

        <div className="rounded-xl border border-line/10 bg-brand-bg px-4 py-3 text-xs text-textSecondary leading-relaxed">
          ⚠️ **Safety Guidelines**: AI recommendations and test suites are suggested for local execution. Nothing will run automatically on the host machine.
        </div>

        <LatestSavedResult messages={currentMessages} />
      </div>
    </div>
  );
}

