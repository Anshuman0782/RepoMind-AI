"use client";

import { FormEvent } from "react";
import { ChatMessage } from "../types";
import { LatestSavedResult } from "./LatestSavedResult";
import { Compass, Bug, Search } from "lucide-react";

type NavigatorViewProps = {
  selectedProjectId: string;
  busy: boolean;
  pendingAction: string;
  investigationMode: "navigator" | "bug";
  investigationPrompt: string;
  currentMessages: ChatMessage[];
  setInvestigationMode: (mode: "navigator" | "bug") => void;
  setInvestigationPrompt: (value: string) => void;
  onInvestigation: (event: FormEvent<HTMLFormElement>) => void;
};

export function NavigatorView({
  selectedProjectId,
  busy,
  pendingAction,
  investigationMode,
  investigationPrompt,
  currentMessages,
  setInvestigationMode,
  setInvestigationPrompt,
  onInvestigation,
}: NavigatorViewProps) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto py-4">
      <div className="mx-auto max-w-3xl rounded-xl border border-line/20 bg-panel/30 p-5 shadow-xl backdrop-blur-md">
        {/* Toggle Mode selectors */}
        <div className="flex gap-1 rounded-xl border border-line/25 bg-brand-sidebar p-1.5 text-xs sm:text-sm">
          <button
            type="button"
            className={`flex-1 rounded-lg px-4 py-2 font-semibold transition flex items-center justify-center gap-2 ${
              investigationMode === "navigator"
                ? "bg-accent text-white shadow shadow-accent/25"
                : "text-textSecondary hover:text-ink"
            }`}
            onClick={() => setInvestigationMode("navigator")}
          >
            <Compass size={14} />
            Find code coordinates
          </button>
          <button
            type="button"
            className={`flex-1 rounded-lg px-4 py-2 font-semibold transition flex items-center justify-center gap-2 ${
              investigationMode === "bug"
                ? "bg-accent text-white shadow shadow-accent/25"
                : "text-textSecondary hover:text-ink"
            }`}
            onClick={() => setInvestigationMode("bug")}
          >
            <Bug size={14} />
            Investigate bug causes
          </button>
        </div>

        {/* Input Form */}
        <form className="mt-5 space-y-4" onSubmit={onInvestigation}>
          <textarea
            className="min-h-36 w-full resize-none rounded-xl border border-line/30 bg-brand-bg px-4 py-3 text-xs sm:text-sm text-ink placeholder-textMuted outline-none focus:border-accent transition"
            placeholder={
              investigationMode === "bug"
                ? "Provide code traces, stack errors, slows, or failing behavior..."
                : "Describe a query (e.g. 'Where is login handled?' or 'Where are models stored?')..."
            }
            value={investigationPrompt}
            onChange={(event) => setInvestigationPrompt(event.target.value)}
            disabled={!selectedProjectId || busy}
            required
          />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-textSecondary font-medium">
              💡 Finding maps and source evidence will automatically save into the chat thread.
            </p>
            <button
              className="rounded-lg bg-accent px-4 py-2.5 text-xs font-semibold text-white shadow hover:bg-accent-light transition disabled:opacity-50"
              disabled={busy || !selectedProjectId}
            >
              {pendingAction === "investigate" ? "Running agent..." : "Scan & Investigate Code"}
            </button>
          </div>
        </form>

        <LatestSavedResult messages={currentMessages} />
      </div>
    </div>
  );
}

