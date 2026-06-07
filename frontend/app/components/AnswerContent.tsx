"use client";

import React, { useState } from "react";
import { Copy, Check, FileCode2, ExternalLink } from "lucide-react";

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
      parts.push({ type: "text", content: textBefore });
    }
    parts.push({
      type: "code",
      language: match[1]?.trim() || "code",
      content: match[2].replace(/\n$/, ""),
    });
    lastIndex = match.index + match[0].length;
  }

  const text = answer;
  const remainingText = text.slice(lastIndex);
  if (remainingText.trim()) {
    parts.push({ type: "text", content: remainingText });
  }

  return parts.length > 0 ? parts : [{ type: "text", content: answer }];
}

function getRelativePath(url: string): string {
  let decodedUrl = decodeURIComponent(url);
  decodedUrl = decodedUrl.replace(/\\/g, '/');
  
  // Find project folder segment
  const matchSegment = "OneDrive/Documents/New project 2/";
  const index = decodedUrl.indexOf(matchSegment);
  if (index !== -1) {
    return decodedUrl.slice(index + matchSegment.length);
  }
  
  // Or strip any file:// protocol
  const filePrefix = "file:///";
  if (decodedUrl.startsWith(filePrefix)) {
    decodedUrl = decodedUrl.slice(filePrefix.length);
  }
  
  // Strip drive letter if it's like C:/Users/USER/...
  const driveMatch = decodedUrl.match(/^[a-zA-Z]:\//);
  if (driveMatch) {
    decodedUrl = decodedUrl.replace(/^[a-zA-Z]:\//, "");
  }
  
  return decodedUrl;
}

function renderInlineText(text: string, onOpenFile?: (path: string) => void) {
  const parts = text.split(/(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|`[^`]+`)/g);

  return parts.map((part, index) => {
    if (part.startsWith("[") && part.includes("](")) {
      const match = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (match) {
        const linkText = match[1];
        const linkUrl = match[2];
        const isFileLink = linkUrl.startsWith("file://") || linkUrl.includes("/") || linkUrl.endsWith(".py") || linkUrl.endsWith(".tsx") || linkUrl.endsWith(".ts") || linkUrl.endsWith(".js") || linkUrl.endsWith(".json");

        if (isFileLink && onOpenFile) {
          const relativePath = getRelativePath(linkUrl);
          return (
            <button
              key={index}
              type="button"
              className="inline text-accent hover:underline font-mono text-[0.92em] font-semibold transition-all cursor-pointer bg-transparent border-0 p-0 align-baseline"
              onClick={() => onOpenFile(relativePath)}
              title={`Open ${relativePath}`}
            >
              {linkText}
            </button>
          );
        }

        return (
          <a
            key={index}
            href={linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline font-medium inline-flex items-center gap-0.5"
          >
            {linkText}
            <ExternalLink size={10} className="shrink-0" />
          </a>
        );
      }
    }

    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={index} className="font-mono text-indigo-400 bg-transparent px-0.5 text-[0.92em]">
          {part.slice(1, -1)}
        </code>
      );
    }

    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={index} className="font-bold text-textPrimary">
          {part.slice(2, -2)}
        </strong>
      );
    }

    return part;
  });
}

function CodeBlock({ content, language }: { content: string; language: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-line/40 bg-zinc-950/80 text-zinc-100 my-4 shadow-lg shadow-black/20">
      <div className="flex items-center justify-between border-b border-line/20 bg-brand-sidebar px-4 py-2 text-xs font-mono text-zinc-400">
        <span className="flex items-center gap-1.5 lowercase">
          <span className="w-2 h-2 rounded-full bg-accent/80 inline-block" />
          {language}
        </span>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-zinc-400 hover:bg-line/20 hover:text-white transition duration-200"
          onClick={handleCopy}
          aria-label="Copy code"
        >
          {copied ? (
            <>
              <Check size={13} className="text-emerald-400" />
              <span className="text-emerald-400">Copied!</span>
            </>
          ) : (
            <>
              <Copy size={13} />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="max-h-96 overflow-auto p-4 text-[11px] leading-relaxed font-mono bg-black/40 text-zinc-200">
        <code>{content}</code>
      </pre>
    </div>
  );
}

function renderMarkdownBlock(markdown: string, onOpenFile?: (path: string) => void): React.ReactNode[] {
  const lines = markdown.split("\n");
  const elements: React.ReactNode[] = [];
  let currentListItems: { text: string; indent: number }[] = [];
  let currentListType: "ul" | "ol" | null = null;

  function flushList() {
    if (currentListItems.length === 0) return;
    const listKey = `list:${elements.length}`;
    if (currentListType === "ol") {
      elements.push(
        <ol key={listKey} className="list-decimal pl-6 my-2.5 space-y-1 text-xs sm:text-sm text-textSecondary">
          {currentListItems.map((item, idx) => (
            <li key={idx} style={{ marginLeft: `${item.indent * 8}px` }}>
              {renderInlineText(item.text, onOpenFile)}
            </li>
          ))}
        </ol>
      );
    } else {
      elements.push(
        <ul key={listKey} className="list-disc pl-6 my-2.5 space-y-1 text-xs sm:text-sm text-textSecondary">
          {currentListItems.map((item, idx) => (
            <li key={idx} style={{ marginLeft: `${item.indent * 8}px` }}>
              {renderInlineText(item.text, onOpenFile)}
            </li>
          ))}
        </ul>
      );
    }
    currentListItems = [];
    currentListType = null;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      flushList();
      continue;
    }

    // Check headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushList();
      const level = headingMatch[1].length;
      const title = headingMatch[2];
      const hKey = `h:${elements.length}:${i}`;
      if (level === 1) {
        elements.push(
          <h1 key={hKey} className="text-xl sm:text-2xl font-bold text-textPrimary border-b border-line/20 pb-2 mt-4 mb-2">
            {renderInlineText(title, onOpenFile)}
          </h1>
        );
      } else if (level === 2) {
        elements.push(
          <h2 key={hKey} className="text-lg sm:text-xl font-bold text-textPrimary mt-4 mb-2">
            {renderInlineText(title, onOpenFile)}
          </h2>
        );
      } else {
        elements.push(
          <h3 key={hKey} className="text-xs sm:text-sm font-semibold text-textPrimary mt-3 mb-1.5">
            {renderInlineText(title, onOpenFile)}
          </h3>
        );
      }
      continue;
    }

    // Check blockquote
    if (trimmed.startsWith("> ")) {
      flushList();
      const quoteText = line.substring(line.indexOf(">") + 1).trim();
      elements.push(
        <blockquote key={`q:${elements.length}:${i}`} className="border-l-4 border-accent/40 bg-panel/30 pl-4 py-2 my-2 rounded-r-lg text-xs sm:text-sm italic text-textSecondary">
          {renderInlineText(quoteText, onOpenFile)}
        </blockquote>
      );
      continue;
    }

    // Check unordered list
    const ulMatch = line.match(/^(\s*)([-*+])\s+(.+)$/);
    if (ulMatch) {
      if (currentListType === "ol") flushList();
      currentListType = "ul";
      const indent = ulMatch[1].length;
      currentListItems.push({ text: ulMatch[3], indent });
      continue;
    }

    // Check ordered list
    const olMatch = line.match(/^(\s*)(\d+)\.\s+(.+)$/);
    if (olMatch) {
      if (currentListType === "ul") flushList();
      currentListType = "ol";
      const indent = olMatch[1].length;
      currentListItems.push({ text: olMatch[3], indent });
      continue;
    }

    // Default: paragraph line
    flushList();
    elements.push(
      <p key={`p:${elements.length}:${i}`} className="text-xs sm:text-sm leading-relaxed text-textSecondary whitespace-pre-wrap my-1.5">
        {renderInlineText(line, onOpenFile)}
      </p>
    );
  }

  flushList();
  return elements;
}

export function AnswerContent({ answer, onOpenFile }: { answer: string; onOpenFile?: (path: string) => void }) {
  const parts = parseAnswer(answer);

  return (
    <div className="space-y-2 leading-6 sm:leading-7">
      {parts.map((part, index) => {
        if (part.type === "code") {
          return <CodeBlock key={`code:${index}`} content={part.content} language={part.language} />;
        }
        return (
          <div key={`md:${index}`} className="markdown-block">
            {renderMarkdownBlock(part.content, onOpenFile)}
          </div>
        );
      })}
    </div>
  );
}
