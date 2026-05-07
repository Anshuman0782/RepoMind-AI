import { ChatMessage } from "../types";

export function LatestSavedResult({ messages }: { messages: ChatMessage[] }) {
  if (messages.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 rounded-md border border-line bg-panel p-3 text-sm text-zinc-600">
      Latest saved result: <span className="font-medium text-ink">{messages[messages.length - 1].question}</span>
    </div>
  );
}
