import { ChatResponse } from "@/lib/api";

export type WorkspaceMode = "chat" | "files" | "navigator" | "planner" | "editor" | "review" | "commit";

export type ChatMessage = {
  id: string;
  question: string;
  answer: string;
  sources: ChatResponse["sources"];
  createdAt: string;
  routedAgent?: string | null;
  actionChangeSetId?: string;
};
