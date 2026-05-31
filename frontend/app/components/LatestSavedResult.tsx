import { ChatMessage } from "../types";

export function LatestSavedResult({ messages }: { messages: ChatMessage[] }) {
  if (messages.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 rounded-xl border border-line/40 bg-brand-sidebar/30 p-4 text-xs sm:text-sm text-zinc-400">
      Latest saved result: <span className="font-semibold text-zinc-100">{messages[messages.length - 1].question}</span>
    </div>
  );
}
