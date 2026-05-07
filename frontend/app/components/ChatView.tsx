"use client";

import { FormEvent, RefObject } from "react";
import { Send } from "lucide-react";
import { Project } from "@/lib/api";
import { ChatMessage } from "../types";
import { AnswerContent } from "./AnswerContent";

type ChatViewProps = {
  selectedProject: Project | undefined;
  selectedChat: { title: string } | undefined;
  selectedProjectId: string;
  currentMessages: ChatMessage[];
  pendingQuestion: string;
  pendingAction: string;
  message: string;
  busy: boolean;
  isLoadingMessages: boolean;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  setMessage: (value: string) => void;
  onChat: (event: FormEvent<HTMLFormElement>) => void;
};

export function ChatView({
  selectedProject,
  selectedChat,
  selectedProjectId,
  currentMessages,
  pendingQuestion,
  pendingAction,
  message,
  busy,
  isLoadingMessages,
  messagesEndRef,
  setMessage,
  onChat,
}: ChatViewProps) {
  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto py-4 pr-1 sm:py-6">
        {isLoadingMessages ? (
          <div className="space-y-6">
            <div className="ml-auto h-20 max-w-[78%] animate-pulse rounded-md bg-zinc-200" />
            <div className="h-32 max-w-[88%] animate-pulse rounded-md border border-line bg-white" />
          </div>
        ) : currentMessages.length > 0 || pendingQuestion ? (
          <div className="space-y-6">
            {currentMessages.map((item) => (
              <article key={item.id} className="space-y-3">
                <div className="ml-auto max-w-full rounded-md bg-ink px-3 py-2.5 text-sm text-white sm:max-w-[78%] sm:px-4 sm:py-3 sm:text-base">
                  <div className="mb-1 text-xs font-medium text-zinc-300">You at {item.createdAt}</div>
                  <p className="whitespace-pre-wrap leading-6">{item.question}</p>
                </div>

                <div className="max-w-full rounded-md border border-line bg-white px-3 py-2.5 text-sm sm:max-w-[88%] sm:px-4 sm:py-3 sm:text-base">
                  <div className="mb-2 flex items-center justify-between gap-3 text-xs font-semibold uppercase text-zinc-500">
                    <span>RepoMind</span>
                    {item.sources.length > 0 ? (
                      <span className="rounded bg-panel px-2 py-1 normal-case text-zinc-600">
                        {item.sources.length} sources
                      </span>
                    ) : null}
                  </div>
                  <AnswerContent answer={item.answer} />

                  {item.sources.length > 0 ? (
                    <details className="mt-4 rounded-md border border-line bg-panel">
                      <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-zinc-700">
                        Source references
                      </summary>
                      <div className="grid gap-2 border-t border-line p-2 sm:p-3">
                        {item.sources.map((source, index) => (
                          <details
                            key={`${item.id}:${source.file_path}:${source.start_line}:${source.end_line}:${index}`}
                            className="rounded-md border border-line bg-white"
                          >
                            <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-zinc-700">
                              <span className="mr-2 rounded bg-panel px-1.5 py-0.5 text-[11px] text-zinc-500">
                                {index + 1}
                              </span>
                              <span className="break-all">
                                {source.file_path}:{source.start_line}-{source.end_line}
                              </span>
                            </summary>
                            <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words border-t border-line bg-zinc-950 p-3 text-xs leading-5 text-zinc-100">
                              <code>{source.content}</code>
                            </pre>
                          </details>
                        ))}
                      </div>
                    </details>
                  ) : null}
                </div>
              </article>
            ))}
            {pendingQuestion ? (
              <article className="space-y-3">
                <div className="ml-auto max-w-full rounded-md bg-ink px-3 py-2.5 text-sm text-white sm:max-w-[78%] sm:px-4 sm:py-3 sm:text-base">
                  <div className="mb-1 text-xs font-medium text-zinc-300">You just now</div>
                  <p className="whitespace-pre-wrap leading-6">{pendingQuestion}</p>
                </div>
                <div className="max-w-full rounded-md border border-line bg-white px-3 py-2.5 text-sm sm:max-w-[88%] sm:px-4 sm:py-3">
                  <div className="mb-2 text-xs font-semibold uppercase text-zinc-500">RepoMind</div>
                  <div className="flex items-center gap-2 text-sm text-zinc-600">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
                    Thinking through the repo context...
                  </div>
                </div>
              </article>
            ) : null}
            <div ref={messagesEndRef} />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-center">
            <div className="max-w-sm rounded-md border border-dashed border-line bg-panel px-5 py-6">
              <p className="text-sm font-medium text-ink">
                {selectedProject ? (selectedChat ? "This chat is ready." : "No chat selected.") : "No project selected."}
              </p>
              <p className="mt-2 text-sm leading-6 text-zinc-500">
                {selectedProject
                  ? selectedChat
                    ? "Ask a focused question and RepoMind will answer with source references."
                    : "Create a chat or ask a question to start one."
                  : "Import or select a repo to start chatting."}
              </p>
            </div>
          </div>
        )}
      </div>

      <form className="flex flex-col gap-2 border-t border-line pt-3 sm:flex-row sm:gap-3 sm:pt-4" onSubmit={onChat}>
        <textarea
          className="min-h-16 flex-1 resize-none rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent sm:min-h-20 sm:text-base"
          placeholder={selectedProject ? "Ask about the selected repo..." : "Select a project first"}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          required
        />
        <button
          className="flex h-12 items-center gap-2 rounded-md bg-ink px-5 text-sm font-medium text-white transition-all duration-150 active:scale-[0.97] disabled:opacity-60 sm:h-20"
          disabled={busy || !selectedProjectId}
          type="submit"
        >
          {pendingAction === "ask" ? (
            <>
              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Thinking...
            </>
          ) : (
            <Send size={25} />
          )}
        </button>
      </form>
    </>
  );
}
