"use client";

import { Copy } from "lucide-react";

type AnswerPart =
  | {
      type: "text";
      content: string;
    }
  | {
      type: "code";
      language: string;
      content: string;
    };

function parseAnswer(answer: string): AnswerPart[] {
  const parts: AnswerPart[] = [];
  const codeBlockPattern = /```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockPattern.exec(answer)) !== null) {
    const textBefore = answer.slice(lastIndex, match.index);
    if (textBefore.trim()) {
      parts.push({ type: "text", content: textBefore.trim() });
    }
    parts.push({
      type: "code",
      language: match[1]?.trim() || "code",
      content: match[2].replace(/\n$/, ""),
    });
    lastIndex = match.index + match[0].length;
  }

  const remainingText = answer.slice(lastIndex);
  if (remainingText.trim()) {
    parts.push({ type: "text", content: remainingText.trim() });
  }

  return parts.length > 0 ? parts : [{ type: "text", content: answer }];
}

function renderInlineText(text: string) {
  const tokens = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return tokens.map((token, index) => {
    if (token.startsWith("`") && token.endsWith("`")) {
      return (
        <code key={`${token}:${index}`} className="rounded bg-panel px-1 py-0.5 text-[0.92em] text-ink">
          {token.slice(1, -1)}
        </code>
      );
    }
    if (token.startsWith("**") && token.endsWith("**")) {
      return (
        <strong key={`${token}:${index}`} className="font-semibold text-ink">
          {token.slice(2, -2)}
        </strong>
      );
    }
    return token;
  });
}

export function AnswerContent({ answer }: { answer: string }) {
  const parts = parseAnswer(answer);

  async function copyCode(content: string) {
    await navigator.clipboard.writeText(content);
  }

  return (
    <div className="space-y-3 leading-6 sm:leading-7">
      {parts.map((part, index) => {
        if (part.type === "code") {
          return (
            <div
              key={`code:${index}`}
              className="overflow-hidden rounded-md border border-zinc-800 bg-zinc-950 text-zinc-100"
            >
              <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-300">
                <span>{part.language}</span>
                <button
                  type="button"
                  className="rounded p-1 text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
                  onClick={() => copyCode(part.content)}
                  aria-label="Copy code"
                  title="Copy code"
                >
                  <Copy size={16} />
                </button>
              </div>
              <pre className="max-h-96 overflow-auto p-3 text-xs leading-5">
                <code>{part.content}</code>
              </pre>
            </div>
          );
        }

        return part.content.split(/\n{2,}/).map((paragraph, paragraphIndex) => (
          <p key={`text:${index}:${paragraphIndex}`} className="whitespace-pre-wrap">
            {renderInlineText(paragraph)}
          </p>
        ));
      })}
    </div>
  );
}
