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
    <div className="grid min-h-0 flex-1 gap-4 py-4 lg:grid-cols-[320px_1fr]">
      <div className="flex min-h-0 flex-col rounded-md border border-line bg-panel">
        <div className="border-b border-line p-3">
          <input
            className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent"
            placeholder="Filter files"
            value={fileFilter}
            onChange={(event) => setFileFilter(event.target.value)}
            disabled={!selectedProjectId}
          />
          <p className="mt-2 text-xs text-zinc-500">
            {loadingFilesProjectId === selectedProjectId ? "Loading files..." : `${filteredFiles.length} files`}
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {filteredFiles.map((file) => (
            <button
              key={file.path}
              type="button"
              className={`mb-1 w-full rounded-md px-2 py-2 text-left text-xs transition ${
                selectedFilePath === file.path ? "bg-ink text-white" : "bg-white text-zinc-700 hover:bg-zinc-100"
              }`}
              onClick={() => onOpenFile(file.path)}
            >
              <span className="block truncate font-medium">{file.path}</span>
              <span className={selectedFilePath === file.path ? "text-zinc-300" : "text-zinc-500"}>
                {formatBytes(file.size)}
              </span>
            </button>
          ))}
          {!selectedProject ? <p className="p-3 text-sm text-zinc-500">Select a project to browse files.</p> : null}
          {selectedProject && !loadingFilesProjectId && filteredFiles.length === 0 ? (
            <p className="p-3 text-sm text-zinc-500">No matching files.</p>
          ) : null}
        </div>
      </div>

      <div className="flex min-h-0 flex-col gap-4">
        <div className="rounded-md border border-line bg-white p-3">
          <form className="flex flex-col gap-2 sm:flex-row" onSubmit={onSearchCode}>
            <input
              className="min-w-0 flex-1 rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent"
              placeholder="Search code"
              value={codeSearch}
              onChange={(event) => setCodeSearch(event.target.value)}
              disabled={!selectedProjectId}
            />
            <button
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              disabled={busy || !selectedProjectId}
            >
              {pendingAction === "search-code" ? "Searching..." : "Search"}
            </button>
            <button
              type="button"
              className="rounded-md border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-panel disabled:opacity-60"
              onClick={onReadGitDiff}
              disabled={busy || !selectedProjectId}
            >
              {pendingAction === "git-diff" ? "Loading..." : "Git diff"}
            </button>
          </form>
          {searchResults.length > 0 ? (
            <div className="mt-3 max-h-44 overflow-y-auto rounded-md border border-line">
              {searchResults.map((result) => (
                <button
                  key={`${result.file_path}:${result.line_number}:${result.line}`}
                  type="button"
                  className="block w-full border-b border-line px-3 py-2 text-left text-xs last:border-b-0 hover:bg-panel"
                  onClick={() => onOpenFile(result.file_path)}
                >
                  <span className="font-medium text-ink">
                    {result.file_path}:{result.line_number}
                  </span>
                  <span className="mt-1 block truncate text-zinc-600">{result.line}</span>
                </button>
              ))}
            </div>
          ) : null}
          {gitDiff ? (
            <pre className="mt-3 max-h-44 overflow-auto rounded-md bg-zinc-950 p-3 text-xs leading-5 text-zinc-100">
              <code>{gitDiff}</code>
            </pre>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-line bg-white">
          {loadingFilePath === selectedFilePath ? (
            <div className="p-4 text-sm text-zinc-500">Loading file...</div>
          ) : selectedFileContent ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
                <h3 className="min-w-0 truncate text-sm font-semibold">{selectedFileContent.path}</h3>
                <span className="text-xs text-zinc-500">
                  {selectedFileContent.line_count} lines / {formatBytes(selectedFileContent.size)}
                </span>
              </div>
              <pre className="h-full max-h-[calc(100vh-330px)] overflow-auto bg-zinc-950 p-4 text-xs leading-5 text-zinc-100">
                <code>{selectedFileContent.content}</code>
              </pre>
            </>
          ) : (
            <div className="flex h-full min-h-72 items-center justify-center text-center">
              <div className="max-w-sm px-5">
                <p className="text-sm font-medium text-ink">File explorer ready.</p>
                <p className="mt-2 text-sm leading-6 text-zinc-500">
                  Pick a file, search the codebase, or inspect the current git diff.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
