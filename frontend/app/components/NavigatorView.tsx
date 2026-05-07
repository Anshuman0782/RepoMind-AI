"use client";

import { FormEvent } from "react";
import { ChatMessage } from "../types";
import { LatestSavedResult } from "./LatestSavedResult";

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
      <div className="mx-auto max-w-3xl rounded-md border border-line bg-white p-4 sm:p-5">
        <div className="flex rounded-md border border-line bg-panel p-1 text-sm">
          <button
            type="button"
            className={`flex-1 rounded px-3 py-2 font-medium transition ${
              investigationMode === "navigator" ? "bg-white text-ink shadow-sm" : "text-zinc-600 hover:text-ink"
            }`}
            onClick={() => setInvestigationMode("navigator")}
          >
            Find area
          </button>
          <button
            type="button"
            className={`flex-1 rounded px-3 py-2 font-medium transition ${
              investigationMode === "bug" ? "bg-white text-ink shadow-sm" : "text-zinc-600 hover:text-ink"
            }`}
            onClick={() => setInvestigationMode("bug")}
          >
            Investigate bug
          </button>
        </div>

        <form className="mt-4 space-y-3" onSubmit={onInvestigation}>
          <textarea
            className="min-h-36 w-full resize-none rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent"
            placeholder={
              investigationMode === "bug"
                ? "Describe the bug, error text, failing behavior, or screen involved..."
                : "Ask where a feature, route, symbol, or behavior is handled..."
            }
            value={investigationPrompt}
            onChange={(event) => setInvestigationPrompt(event.target.value)}
            disabled={!selectedProjectId || busy}
            required
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-5 text-zinc-500">
              Results are saved into the selected chat with source references.
            </p>
            <button
              className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              disabled={busy || !selectedProjectId}
            >
              {pendingAction === "investigate" ? "Investigating..." : "Run navigator"}
            </button>
          </div>
        </form>

        <LatestSavedResult messages={currentMessages} />
      </div>
    </div>
  );
}
