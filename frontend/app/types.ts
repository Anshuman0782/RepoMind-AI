import { ChatResponse } from "@/lib/api";

export type WorkspaceMode =
  | "chat"
  | "files"
  | "architecture"
  | "navigator"
  | "planner"
  | "editor"
  | "review"
  | "commit";

export type ChatMessage = {
  id: string;
  question: string;
  answer: string;
  sources: ChatResponse["sources"];
  createdAt: string;
  routedAgent?: string | null;
  agentStatus?: string | null;
  suggestedWorkspaceMode?: WorkspaceMode | null;
  suggestedAction?: string | null;
  suggestedPath?: string | null;
  actionChangeSetId?: string;
};
