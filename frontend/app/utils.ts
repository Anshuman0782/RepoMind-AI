import { ChatMessageResponse } from "@/lib/api";
import { ChatMessage } from "./types";

export function formatChatTime(value: string): string {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function toChatMessage(message: ChatMessageResponse): ChatMessage {
  return {
    id: message.id,
    question: message.question,
    answer: message.answer,
    sources: message.sources,
    createdAt: formatChatTime(message.created_at),
  };
}

export function titleFromQuestion(question: string): string {
  const title = question.trim().replace(/\s+/g, " ");
  return title.length > 60 ? `${title.slice(0, 57).trim()}...` : title || "New chat";
}

export function isDocumentationRequest(question: string): boolean {
  return /\b(api docs|architecture|documentation|docs|explain file|explain module|onboarding|readme|setup notes)\b/i.test(
    question,
  );
}

export function formatBytes(value: number): string {
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
