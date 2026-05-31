"use client";

import { WorkspaceMode } from "../types";
import { MessageSquare, FolderOpen, Network, Compass, ClipboardList, FileCode2, Eye, GitCommit } from "lucide-react";

const TABS: { mode: WorkspaceMode; label: string; icon: any }[] = [
  { mode: "chat", label: "Chat", icon: MessageSquare },
  { mode: "files", label: "Files", icon: FolderOpen },
  { mode: "architecture", label: "Map", icon: Network },
  { mode: "navigator", label: "Navigator", icon: Compass },
  { mode: "planner", label: "Planner", icon: ClipboardList },
  { mode: "editor", label: "Editor", icon: FileCode2 },
  { mode: "review", label: "Review", icon: Eye },
  { mode: "commit", label: "Commit", icon: GitCommit },
];

type WorkspaceTabsProps = {
  workspaceMode: WorkspaceMode;
  selectedProjectId: string;
  setWorkspaceMode: (mode: WorkspaceMode) => void;
};

export function WorkspaceTabs({ workspaceMode, selectedProjectId, setWorkspaceMode }: WorkspaceTabsProps) {
  return (
    <div className="mt-4 flex w-full gap-1 overflow-x-auto rounded-xl border border-line/40 bg-brand-sidebar/50 p-1.5 text-sm md:grid md:grid-cols-8 md:overflow-x-visible backdrop-blur-md scrollbar-none">
      {TABS.map((tab) => {
        const isActive = workspaceMode === tab.mode;
        const isDisabled = tab.mode !== "chat" && !selectedProjectId;
        const Icon = tab.icon;
        return (
          <button
            key={tab.mode}
            type="button"
            className={`whitespace-nowrap rounded-lg px-3 py-2 font-medium transition-all duration-200 flex-1 flex items-center justify-center gap-2 text-center ${
              isActive
                ? "bg-accent text-white shadow-lg shadow-accent/25 translate-y-[-1px]"
                : isDisabled
                ? "text-textMuted opacity-40 cursor-not-allowed"
                : "text-textSecondary hover:bg-line/20 hover:text-ink"
            }`}
            onClick={() => setWorkspaceMode(tab.mode)}
            disabled={isDisabled}
          >
            <Icon size={14} className={isActive ? "text-white" : "text-textSecondary"} />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

