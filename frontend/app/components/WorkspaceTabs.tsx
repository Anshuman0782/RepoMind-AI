"use client";

import { WorkspaceMode } from "../types";

const TABS: { mode: WorkspaceMode; label: string }[] = [
  { mode: "chat", label: "Chat" },
  { mode: "files", label: "Files" },
  { mode: "architecture", label: "Architecture" },
  { mode: "navigator", label: "Navigator" },
  { mode: "planner", label: "Planner" },
  { mode: "editor", label: "Editor" },
  { mode: "review", label: "Review" },
  { mode: "commit", label: "Commit" },
];

type WorkspaceTabsProps = {
  workspaceMode: WorkspaceMode;
  selectedProjectId: string;
  setWorkspaceMode: (mode: WorkspaceMode) => void;
};

export function WorkspaceTabs({ workspaceMode, selectedProjectId, setWorkspaceMode }: WorkspaceTabsProps) {
  return (
    <div className="mt-4 grid w-full grid-cols-2 rounded-md border border-line bg-panel p-1 text-sm sm:grid-cols-4 xl:grid-cols-8">
      {TABS.map((tab) => (
        <button
          key={tab.mode}
          type="button"
          className={`flex-1 rounded px-3 py-2 font-medium transition ${
            workspaceMode === tab.mode ? "bg-white text-ink shadow-sm" : "text-zinc-600 hover:text-ink"
          }`}
          onClick={() => setWorkspaceMode(tab.mode)}
          disabled={tab.mode !== "chat" && !selectedProjectId}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
