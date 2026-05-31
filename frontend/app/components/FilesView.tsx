"use client";

import { FormEvent } from "react";
import { CodeSearchResult, FileContent, FileEntry, Project } from "@/lib/api";
import { formatBytes } from "../utils";

type FilesViewProps = {
  selectedProject: Project | undefined;
  selectedProjectId: string;
  filteredFiles: FileEntry[];
  selectedFilePath: string;
  selectedFileContent: FileContent | undefined;
  fileFilter: string;
  codeSearch: string;
  searchResults: CodeSearchResult[];
  gitDiff: string;
  loadingFilesProjectId: string;
  loadingFilePath: string;
  busy: boolean;
  pendingAction: string;
  setFileFilter: (value: string) => void;
  setCodeSearch: (value: string) => void;
  onOpenFile: (path: string) => void;
  onSearchCode: (event: FormEvent<HTMLFormElement>) => void;
  onReadGitDiff: () => void;
};

export function FilesView({
  selectedProject,
  selectedProjectId,
  filteredFiles,
  selectedFilePath,
  selectedFileContent,
  fileFilter,
  codeSearch,
  searchResults,
  gitDiff,
  loadingFilesProjectId,
  loadingFilePath,
  busy,
  pendingAction,
  setFileFilter,
  setCodeSearch,
  onOpenFile,
  onSearchCode,
  onReadGitDiff,
}: FilesViewProps) {
  return (
    <div className="grid min-h-0 flex-1 gap-4 py-4 lg:grid-cols-[280px_1fr]">
      {/* File Browser Panel */}
      <div className="flex min-h-0 flex-col rounded-xl border border-line/20 bg-brand-sidebar/40 backdrop-blur-md">
        <div className="border-b border-line/10 p-3">
          <input
            className="w-full rounded-lg border border-line/30 bg-brand-bg px-3 py-2 text-xs text-ink placeholder-textMuted outline-none focus:border-accent transition"
            placeholder="🔍 Filter files by name..."
            value={fileFilter}
            onChange={(event) => setFileFilter(event.target.value)}
            disabled={!selectedProjectId}
          />
          <p className="mt-2 text-[10px] font-bold text-textMuted uppercase tracking-wider block px-1">
            {loadingFilesProjectId === selectedProjectId ? "🔄 Scanning files..." : `📁 ${filteredFiles.length} Code Files`}
          </p>
        </div>
        <div className="min-h-[200px] lg:min-h-0 flex-1 overflow-y-auto p-2 space-y-1">
          {filteredFiles.map((file) => {
            const isSelected = selectedFilePath === file.path;
            return (
              <button
                key={file.path}
                type="button"
                className={`w-full rounded-lg px-2.5 py-2 text-left transition-all duration-150 flex flex-col gap-0.5 ${
                  isSelected
                    ? "bg-accent-dim border border-accent/30 text-accent font-semibold"
                    : "bg-transparent text-textSecondary border border-transparent hover:bg-line/20 hover:text-ink"
                }`}
                onClick={() => onOpenFile(file.path)}
              >
                <span className="block truncate font-mono text-[11px] font-semibold">{file.path}</span>
                <span className={`text-[10px] ${isSelected ? "text-accent" : "text-textMuted"}`}>
                  {formatBytes(file.size)}
                </span>
              </button>
            );
          })}
          {!selectedProject && (
            <p className="p-3 text-xs text-textSecondary italic text-center">Select a workspace to browse files.</p>
          )}
          {selectedProject && !loadingFilesProjectId && filteredFiles.length === 0 && (
            <p className="p-3 text-xs text-textSecondary italic text-center">No matching files found.</p>
          )}
        </div>
      </div>

      {/* Editor & Search Panel */}
      <div className="flex min-h-0 flex-col gap-4">
        {/* Actions Bar */}
        <div className="rounded-xl border border-line/20 bg-panel/30 p-3 space-y-3">
          <form className="flex flex-col gap-2 sm:flex-row" onSubmit={onSearchCode}>
            <input
              className="min-w-0 flex-1 rounded-lg border border-line/30 bg-brand-bg px-3.5 py-2 text-xs text-ink placeholder-textMuted outline-none focus:border-accent transition"
              placeholder="🔍 Search text within the codebase..."
              value={codeSearch}
              onChange={(event) => setCodeSearch(event.target.value)}
              disabled={!selectedProjectId}
            />
            <div className="flex gap-2">
              <button
                className="flex-1 sm:flex-none rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white shadow shadow-accent/10 hover:bg-accent-light transition disabled:opacity-50"
                disabled={busy || !selectedProjectId}
              >
                {pendingAction === "search-code" ? "Searching..." : "Search"}
              </button>
              <button
                type="button"
                className="flex-1 sm:flex-none rounded-lg border border-line/30 bg-brand-bg px-4 py-2 text-xs font-semibold text-textSecondary hover:bg-line/20 hover:text-ink transition disabled:opacity-50"
                onClick={onReadGitDiff}
                disabled={busy || !selectedProjectId}
              >
                {pendingAction === "git-diff" ? "Loading..." : "Git Diff"}
              </button>
            </div>
          </form>

          {/* Search results */}
          {searchResults.length > 0 && (
            <div className="max-h-44 overflow-y-auto rounded-lg border border-line/20 bg-brand-bg divide-y divide-line/15 shadow">
              {searchResults.map((result, idx) => (
                <button
                  key={`${result.file_path}:${result.line_number}:${result.line}:${idx}`}
                  type="button"
                  className="block w-full px-3 py-2 text-left text-xs hover:bg-line/10 transition"
                  onClick={() => onOpenFile(result.file_path)}
                >
                  <span className="font-mono text-[11px] font-bold text-accent">
                    📄 {result.file_path}:{result.line_number}
                  </span>
                  <span className="mt-1 block truncate text-textSecondary font-mono text-[10px]">
                    {result.line}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Git Diff Output */}
          {gitDiff && (
            <pre className="max-h-44 overflow-auto rounded-lg bg-brand-bg border border-line/20 p-3 text-[11px] leading-relaxed text-textPrimary font-mono">
              <code>{gitDiff}</code>
            </pre>
          )}
        </div>

        {/* Code Viewer Panel */}
        <div className="min-h-[300px] flex-1 overflow-hidden rounded-xl border border-line/20 bg-panel/30 flex flex-col">
          {loadingFilePath === selectedFilePath ? (
            <div className="flex-1 flex items-center justify-center p-4 text-xs text-textSecondary animate-pulse">
              🔄 Streaming file content...
            </div>
          ) : selectedFileContent ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/10 bg-brand-sidebar/20 px-4 py-2.5">
                <h3 className="min-w-0 truncate font-mono text-xs font-semibold text-textPrimary">
                  📄 {selectedFileContent.path}
                </h3>
                <span className="text-[10px] text-textSecondary font-bold bg-brand-bg px-2 py-0.5 rounded-full border border-line/15">
                  {selectedFileContent.line_count} lines • {formatBytes(selectedFileContent.size)}
                </span>
              </div>
              <div className="flex-1 overflow-auto bg-brand-bg p-4">
                <pre className="text-[11px] leading-relaxed text-textPrimary font-mono">
                  <code>{selectedFileContent.content}</code>
                </pre>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-center p-6 min-h-60">
              <div className="max-w-sm">
                <p className="text-sm font-semibold text-textPrimary">File Explorer Ready</p>
                <p className="mt-2 text-xs leading-relaxed text-textSecondary">
                  Select a file from the browser list on the left, execute a full-text search, or check the current git workspace diff.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

