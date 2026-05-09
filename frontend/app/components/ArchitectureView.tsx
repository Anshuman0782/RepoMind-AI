"use client";

import { useMemo, useState } from "react";
import {
  Braces,
  Boxes,
  Database,
  FileCode2,
  Files,
  Maximize2,
  Minimize2,
  GitBranch,
  Layers3,
  Network,
  Route,
  ServerCog,
  SlidersHorizontal,
} from "lucide-react";
import { FileEntry, Project } from "@/lib/api";
import { formatBytes } from "../utils";

type ArchitectureViewProps = {
  selectedProject: Project | undefined;
  selectedProjectId: string;
  files: FileEntry[];
  loadingFilesProjectId: string;
  onOpenFile: (path: string) => void;
};

type FocusMode = "overview" | "frontend" | "backend" | "data";

type LayerKey = "experience" | "client" | "edge" | "services" | "data" | "project";

type ArchitectureNode = {
  id: string;
  title: string;
  subtitle: string;
  layer: LayerKey;
  paths: string[];
  description: string;
  signals: string[];
  x: number;
  y: number;
  icon: typeof Boxes;
};

type ArchitectureConnection = {
  from: string;
  to: string;
  label: string;
};

const DIAGRAM_WIDTH = 960;
const DIAGRAM_HEIGHT = 520;
const NODE_WIDTH = 170;
const NODE_HEIGHT = 64;

const LAYERS: Record<LayerKey, { label: string; tone: string; short: string }> = {
  experience: { label: "Experience", short: "UX", tone: "border-teal-200 bg-teal-50 text-teal-900" },
  client: { label: "Client logic", short: "UI", tone: "border-sky-200 bg-sky-50 text-sky-900" },
  edge: { label: "API boundary", short: "API", tone: "border-violet-200 bg-violet-50 text-violet-900" },
  services: { label: "Agent services", short: "SVC", tone: "border-amber-200 bg-amber-50 text-amber-950" },
  data: { label: "Data and storage", short: "DATA", tone: "border-emerald-200 bg-emerald-50 text-emerald-950" },
  project: { label: "Project shell", short: "OPS", tone: "border-zinc-200 bg-zinc-50 text-zinc-800" },
};

const FOCUS_LABELS: { mode: FocusMode; label: string }[] = [
  { mode: "overview", label: "Overview" },
  { mode: "frontend", label: "Frontend" },
  { mode: "backend", label: "Backend" },
  { mode: "data", label: "Data" },
];

const PREFERRED_NODE_POSITIONS: Record<string, { x: number; y: number }> = {
  interface: { x: 52, y: 118 },
  "client-code": { x: 270, y: 118 },
  "backend-code": { x: 488, y: 118 },
  "data-content": { x: 718, y: 118 },
  "project-config": { x: 52, y: 326 },
  "docs-tests": { x: 270, y: 326 },
  "other-files": { x: 488, y: 326 },
  workspace: { x: 52, y: 118 },
  workspaces: { x: 270, y: 118 },
  "client-api": { x: 488, y: 118 },
  "api-routes": { x: 718, y: 118 },
  "repo-services": { x: 270, y: 326 },
  "agent-services": { x: 488, y: 326 },
  storage: { x: 718, y: 326 },
  "project-shell": { x: 52, y: 326 },
};

const LAYER_FALLBACK_POSITIONS: Record<LayerKey, { x: number; y: number }> = {
  experience: { x: 52, y: 118 },
  client: { x: 270, y: 118 },
  edge: { x: 488, y: 118 },
  services: { x: 488, y: 326 },
  data: { x: 718, y: 118 },
  project: { x: 52, y: 326 },
};

function matchingPaths(files: FileEntry[], tests: RegExp[]) {
  return files
    .map((file) => file.path)
    .filter((path) => tests.some((test) => test.test(path.replaceAll("\\", "/"))));
}

function normalizePath(path: string) {
  return path.replaceAll("\\", "/");
}

function extensionOf(path: string) {
  const name = normalizePath(path).split("/").pop() ?? path;
  const index = name.lastIndexOf(".");
  return index > -1 ? name.slice(index).toLowerCase() : "";
}

function getDiagramLayout(nodes: ArchitectureNode[]) {
  const layerCounts = new Map<LayerKey, number>();

  return nodes.map((node, index) => {
    const preferred = PREFERRED_NODE_POSITIONS[node.id];
    if (preferred) {
      return { node, ...preferred };
    }

    const count = layerCounts.get(node.layer) ?? 0;
    layerCounts.set(node.layer, count + 1);
    const fallback = LAYER_FALLBACK_POSITIONS[node.layer];
    return {
      node,
      x: fallback.x + (count % 2) * 218,
      y: fallback.y + Math.floor(count / 2) * 92 + index * 4,
    };
  });
}

function createGenericNode(
  id: string,
  title: string,
  subtitle: string,
  layer: LayerKey,
  paths: string[],
  description: string,
  signals: string[],
  x: number,
  y: number,
  icon: typeof Boxes,
): ArchitectureNode | null {
  const uniquePaths = [...new Set(paths)].sort((first, second) => first.localeCompare(second));
  if (uniquePaths.length === 0) {
    return null;
  }

  return {
    id,
    title,
    subtitle,
    layer,
    paths: uniquePaths,
    description,
    signals,
    x,
    y,
    icon,
  };
}

function createNode(
  files: FileEntry[],
  node: Omit<ArchitectureNode, "paths"> & { tests: RegExp[] },
): ArchitectureNode | null {
  const paths = matchingPaths(files, node.tests);
  if (paths.length === 0) {
    return null;
  }

  return {
    id: node.id,
    title: node.title,
    subtitle: node.subtitle,
    layer: node.layer,
    paths,
    description: node.description,
    signals: node.signals,
    x: node.x,
    y: node.y,
    icon: node.icon,
  };
}

function buildGenericArchitecture(files: FileEntry[]) {
  const paths = files.map((file) => normalizePath(file.path));
  const configNames = new Set([
    ".env.example",
    ".gitignore",
    "docker-compose.yml",
    "package.json",
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "requirements.txt",
    "pyproject.toml",
    "tsconfig.json",
    "vite.config.js",
    "vite.config.ts",
    "next.config.js",
    "next.config.ts",
    "tailwind.config.js",
    "tailwind.config.ts",
  ]);
  const uiExtensions = new Set([".html", ".css", ".scss", ".sass", ".less", ".vue", ".svelte", ".astro"]);
  const clientExtensions = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs"]);
  const backendExtensions = new Set([
    ".c",
    ".cc",
    ".cpp",
    ".cxx",
    ".c++",
    ".h",
    ".hh",
    ".hpp",
    ".hxx",
    ".h++",
    ".py",
    ".php",
    ".rb",
    ".go",
    ".java",
    ".cs",
    ".rs",
    ".kt",
    ".scala",
    ".ex",
    ".exs",
  ]);
  const dataExtensions = new Set([".csv", ".json", ".jsonc", ".sql", ".xml", ".yaml", ".yml", ".toml"]);
  const docExtensions = new Set([".md", ".mdx", ".rst", ".txt"]);

  const isConfig = (path: string) => {
    const name = path.split("/").pop()?.toLowerCase() ?? path.toLowerCase();
    return configNames.has(name) || /(^|\/)(config|settings|constants)\.[a-z0-9.]+$/i.test(path);
  };
  const isBackendPath = (path: string) => /(^|\/)(api|server|backend|routes|controllers|services)\//i.test(path);
  const isTestPath = (path: string) => /(^|\/)(__tests__|tests?|spec)\//i.test(path) || /\.(test|spec)\./i.test(path);

  const interfacePaths = paths.filter((path) => uiExtensions.has(extensionOf(path)));
  const clientPaths = paths.filter((path) => clientExtensions.has(extensionOf(path)) && !isBackendPath(path) && !isTestPath(path));
  const backendPaths = paths.filter((path) => backendExtensions.has(extensionOf(path)) || isBackendPath(path));
  const dataPaths = paths.filter((path) => dataExtensions.has(extensionOf(path)) && !isConfig(path));
  const configPaths = paths.filter(isConfig);
  const docsPaths = paths.filter((path) => docExtensions.has(extensionOf(path)));
  const testPaths = paths.filter(isTestPath);

  const classified = new Set([
    ...interfacePaths,
    ...clientPaths,
    ...backendPaths,
    ...dataPaths,
    ...configPaths,
    ...docsPaths,
    ...testPaths,
  ]);
  const remainingPaths = paths.filter((path) => !classified.has(path));

  const nodes = [
    createGenericNode(
      "interface",
      "Interface & Styling",
      "Screens, markup, and visual styles",
      "experience",
      interfacePaths,
      "Files that shape the user-facing surface, page structure, and styling.",
      ["views", "styles", "layout"],
      8,
      16,
      Layers3,
    ),
    createGenericNode(
      "client-code",
      "Client Code",
      "Browser-side logic and components",
      "client",
      clientPaths,
      "JavaScript and TypeScript files that likely run UI behavior, state, and client interactions.",
      ["events", "components", "browser logic"],
      34,
      16,
      Braces,
    ),
    createGenericNode(
      "backend-code",
      "Backend Code",
      "Server-side modules and services",
      "services",
      backendPaths,
      "Server-oriented source files inferred from language or folder names.",
      ["server logic", "routes", "services"],
      61,
      16,
      ServerCog,
    ),
    createGenericNode(
      "data-content",
      "Data & Content",
      "Structured content and data files",
      "data",
      dataPaths,
      "Structured files that may feed app content, configuration data, or storage-like behavior.",
      ["json", "csv", "sql"],
      70,
      53,
      Database,
    ),
    createGenericNode(
      "project-config",
      "Project Setup",
      "Runtime, dependency, and build files",
      "project",
      configPaths,
      "Files that define dependencies, build tooling, environment examples, and project settings.",
      ["dependencies", "build", "settings"],
      10,
      53,
      GitBranch,
    ),
    createGenericNode(
      "docs-tests",
      "Docs & Tests",
      "Guides, notes, and verification files",
      "project",
      [...docsPaths, ...testPaths],
      "Documentation and test/spec files that explain or verify behavior.",
      ["readme", "tests", "notes"],
      38,
      53,
      FileCode2,
    ),
    createGenericNode(
      "other-files",
      "Other Source Files",
      "Remaining indexed files",
      "project",
      remainingPaths,
      "Files that do not match a common app layer yet, kept visible so the map never drops project content.",
      ["unclassified", "top-level", "support"],
      24,
      82,
      Boxes,
    ),
  ].filter((node): node is ArchitectureNode => Boolean(node));

  const availableNodeIds = new Set(nodes.map((node) => node.id));
  const connectionCandidates: ArchitectureConnection[] = [
    { from: "project-config", to: "interface", label: "runs" },
    { from: "interface", to: "client-code", label: "uses" },
    { from: "client-code", to: "backend-code", label: "calls" },
    { from: "backend-code", to: "data-content", label: "reads" },
    { from: "docs-tests", to: "client-code", label: "documents" },
    { from: "docs-tests", to: "backend-code", label: "verifies" },
    { from: "other-files", to: "project-config", label: "supports" },
  ];
  const connections = connectionCandidates.filter(
    (connection) => availableNodeIds.has(connection.from) && availableNodeIds.has(connection.to),
  );

  return { nodes, connections };
}

function buildArchitecture(files: FileEntry[]) {
  const nodes = [
    createNode(files, {
      id: "workspace",
      title: "Workspace Shell",
      subtitle: "Next app layout and tab routing",
      layer: "experience",
      tests: [/^frontend\/app\/page\.tsx$/, /^frontend\/app\/layout\.tsx$/, /^frontend\/app\/components\/WorkspaceTabs\.tsx$/],
      description: "Owns project selection, workspace modes, and the main orchestration state for the product surface.",
      signals: ["selected project", "active chat", "workspace mode"],
      x: 8,
      y: 16,
      icon: Layers3,
    }),
    createNode(files, {
      id: "workspaces",
      title: "Agent Workspaces",
      subtitle: "Chat, Files, Planner, Editor, Review, Commit",
      layer: "experience",
      tests: [/^frontend\/app\/components\/(Chat|Files|Navigator|Planner|Editor|Review|Commit)View\.tsx$/],
      description: "Task-focused screens for asking, searching, planning, editing, reviewing, and preparing commits.",
      signals: ["human approval", "diff preview", "saved answers"],
      x: 31,
      y: 16,
      icon: Boxes,
    }),
    createNode(files, {
      id: "client-api",
      title: "Client API Layer",
      subtitle: "Typed fetch contracts",
      layer: "client",
      tests: [/^frontend\/lib\/api\.ts$/, /^frontend\/app\/types\.ts$/, /^frontend\/app\/utils\.ts$/],
      description: "Keeps frontend components talking to the backend through typed request and response helpers.",
      signals: ["project files", "chat messages", "change sets"],
      x: 57,
      y: 16,
      icon: Braces,
    }),
    createNode(files, {
      id: "api-routes",
      title: "FastAPI Routes",
      subtitle: "HTTP endpoints",
      layer: "edge",
      tests: [/^backend\/app\/main\.py$/, /^backend\/app\/api\/.*\.py$/],
      description: "Receives project, chat, file, review, planner, editor, and commit requests from the UI.",
      signals: ["REST calls", "request schemas", "response schemas"],
      x: 78,
      y: 16,
      icon: Route,
    }),
    createNode(files, {
      id: "agent-services",
      title: "Agent Services",
      subtitle: "Answering, planning, review, commit help",
      layer: "services",
      tests: [
        /^backend\/app\/services\/chat_answer_service\.py$/,
        /^backend\/app\/services\/planner_service\.py$/,
        /^backend\/app\/services\/review_service\.py$/,
        /^backend\/app\/services\/investigation_service\.py$/,
        /^backend\/app\/services\/commit_assistant_service\.py$/,
        /^backend\/app\/services\/documentation_service\.py$/,
      ],
      description: "Turns user intent into grounded answers, change plans, code reviews, and commit-ready summaries.",
      signals: ["routing", "LLM prompts", "source-grounded answers"],
      x: 52,
      y: 52,
      icon: ServerCog,
    }),
    createNode(files, {
      id: "repo-services",
      title: "Repo Intelligence",
      subtitle: "Files, search, context, editing tools",
      layer: "services",
      tests: [
        /^backend\/app\/services\/repo_service\.py$/,
        /^backend\/app\/services\/file_scanner\.py$/,
        /^backend\/app\/services\/codebase_tools\.py$/,
        /^backend\/app\/services\/context_utils\.py$/,
        /^backend\/app\/services\/editing_tools\.py$/,
      ],
      description: "Indexes the codebase, reads files, builds context, searches symbols, and prepares safe file operations.",
      signals: ["file inventory", "git diff", "edit previews"],
      x: 26,
      y: 52,
      icon: FileCode2,
    }),
    createNode(files, {
      id: "storage",
      title: "Persistence and Retrieval",
      subtitle: "Database, embeddings, vector store",
      layer: "data",
      tests: [
        /^backend\/app\/core\/database\.py$/,
        /^backend\/app\/models\/schemas\.py$/,
        /^backend\/app\/services\/vector_store\.py$/,
        /^backend\/app\/services\/embedding_provider\.py$/,
        /^backend\/app\/core\/config\.py$/,
      ],
      description: "Stores projects and chats while powering semantic retrieval over indexed repository content.",
      signals: ["schemas", "embeddings", "configuration"],
      x: 63,
      y: 82,
      icon: Database,
    }),
    createNode(files, {
      id: "project-shell",
      title: "Project Shell",
      subtitle: "Runtime and docs",
      layer: "project",
      tests: [
        /^README\.md$/,
        /^GOALS\.md$/,
        /^AGENT_TEST_CASES\.md$/,
        /^CHROMADB_AND_GITHUB_GUIDE\.md$/,
        /^docker-compose\.yml$/,
        /^frontend\/package\.json$/,
        /^backend\/pyproject\.toml$/,
        /^backend\/requirements.*\.txt$/,
      ],
      description: "Defines the local runtime, dependency contracts, operating notes, and acceptance test direction.",
      signals: ["dev server", "dependencies", "guides"],
      x: 11,
      y: 82,
      icon: GitBranch,
    }),
  ].filter((node): node is ArchitectureNode => Boolean(node));

  const availableNodeIds = new Set(nodes.map((node) => node.id));
  const connections: ArchitectureConnection[] = [
    { from: "workspace", to: "workspaces", label: "renders modes" },
    { from: "workspaces", to: "client-api", label: "calls helpers" },
    { from: "client-api", to: "api-routes", label: "fetches JSON" },
    { from: "api-routes", to: "agent-services", label: "delegates intent" },
    { from: "api-routes", to: "repo-services", label: "serves files" },
    { from: "agent-services", to: "repo-services", label: "asks for context" },
    { from: "repo-services", to: "storage", label: "indexes" },
    { from: "agent-services", to: "storage", label: "retrieves" },
    { from: "project-shell", to: "workspace", label: "runs" },
    { from: "project-shell", to: "storage", label: "configures" },
  ].filter((connection) => availableNodeIds.has(connection.from) && availableNodeIds.has(connection.to));

  if (nodes.length === 0 && files.length > 0) {
    return buildGenericArchitecture(files);
  }

  return { nodes, connections };
}

function nodeMatchesFocus(node: ArchitectureNode, focusMode: FocusMode) {
  if (focusMode === "overview") {
    return true;
  }
  if (focusMode === "frontend") {
    return node.layer === "experience" || node.layer === "client";
  }
  if (focusMode === "backend") {
    return node.layer === "edge" || node.layer === "services";
  }
  return node.layer === "data" || node.layer === "project";
}

export function ArchitectureView({
  selectedProject,
  selectedProjectId,
  files,
  loadingFilesProjectId,
  onOpenFile,
}: ArchitectureViewProps) {
  const [focusMode, setFocusMode] = useState<FocusMode>("overview");
  const [selectedNodeId, setSelectedNodeId] = useState<string>("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const architecture = useMemo(() => buildArchitecture(files), [files]);
  const visibleNodeIds = new Set(
    architecture.nodes.filter((node) => nodeMatchesFocus(node, focusMode)).map((node) => node.id),
  );
  const visibleNodes = architecture.nodes.filter((node) => visibleNodeIds.has(node.id));
  const visibleConnections = architecture.connections.filter(
    (connection) => visibleNodeIds.has(connection.from) && visibleNodeIds.has(connection.to),
  );
  const selectedNode = architecture.nodes.find((node) => node.id === selectedNodeId) ?? visibleNodes[0];
  const isLoading = Boolean(selectedProjectId && loadingFilesProjectId === selectedProjectId);
  const fileSizes = new Map(files.map((file) => [file.path, file.size]));
  const frontendCount = architecture.nodes
    .filter((node) => node.layer === "experience" || node.layer === "client")
    .reduce((sum, node) => sum + node.paths.length, 0);
  const backendCount = architecture.nodes
    .filter((node) => node.layer === "edge" || node.layer === "services")
    .reduce((sum, node) => sum + node.paths.length, 0);
  const selectedNodeSize =
    selectedNode?.paths.reduce((sum, path) => sum + (fileSizes.get(path) ?? 0), 0) ?? 0;
  const diagramLayout = getDiagramLayout(visibleNodes);
  const diagramLayoutById = new Map(diagramLayout.map((item) => [item.node.id, item]));
  const renderDiagram = (fullscreen = false) => (
    <div className={`hidden overflow-auto bg-zinc-950 lg:block ${fullscreen ? "h-full p-6" : "p-4"}`}>
      <div
        className={`relative rounded-md border border-zinc-800 bg-zinc-950 ${fullscreen ? "mx-auto" : ""}`}
        style={{ width: DIAGRAM_WIDTH, height: DIAGRAM_HEIGHT }}
      >
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox={`0 0 ${DIAGRAM_WIDTH} ${DIAGRAM_HEIGHT}`}
          aria-hidden="true"
        >
          <defs>
            <marker
              id={fullscreen ? "architecture-arrow-fullscreen" : "architecture-arrow"}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#9ca3af" />
            </marker>
          </defs>
          {visibleConnections.map((connection) => {
            const from = diagramLayoutById.get(connection.from);
            const to = diagramLayoutById.get(connection.to);
            if (!from || !to) {
              return null;
            }
            const startX = from.x + NODE_WIDTH;
            const startY = from.y + NODE_HEIGHT / 2;
            const endX = to.x;
            const endY = to.y + NODE_HEIGHT / 2;
            const bend = Math.max(48, Math.abs(endX - startX) / 2);
            const labelX = (startX + endX) / 2;
            const labelY = (startY + endY) / 2 - 8;
            return (
              <g key={`${connection.from}-${connection.to}`}>
                <path
                  d={`M ${startX} ${startY} C ${startX + bend} ${startY}, ${endX - bend} ${endY}, ${endX} ${endY}`}
                  fill="none"
                  stroke="#9ca3af"
                  strokeWidth="1.4"
                  markerEnd={`url(#${fullscreen ? "architecture-arrow-fullscreen" : "architecture-arrow"})`}
                />
                <text
                  x={labelX}
                  y={labelY}
                  textAnchor="middle"
                  className="fill-zinc-400 text-[11px]"
                >
                  {connection.label}
                </text>
              </g>
            );
          })}
        </svg>

        {diagramLayout.map(({ node, x, y }) => {
          const Icon = node.icon;
          const selected = selectedNode?.id === node.id;
          return (
            <button
              key={node.id}
              type="button"
              className={`absolute rounded-sm border px-4 py-3 text-left shadow-sm transition hover:border-teal-300 hover:bg-zinc-800 ${
                selected ? "border-teal-300 bg-zinc-800 ring-1 ring-teal-300" : "border-zinc-700 bg-zinc-900"
              }`}
              style={{ left: x, top: y, width: NODE_WIDTH, minHeight: NODE_HEIGHT }}
              onClick={() => setSelectedNodeId(node.id)}
            >
              <span className="flex items-center gap-2">
                <Icon className={selected ? "h-4 w-4 text-teal-300" : "h-4 w-4 text-zinc-400"} />
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-white">
                  {node.title}
                </span>
              </span>
              <span className="mt-2 flex items-center justify-between gap-2 text-[11px] text-zinc-400">
                <span className="truncate">{LAYERS[node.layer].label}</span>
                <span>{node.paths.length} files</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
  const renderInspector = (compact = false) => (
    <>
      {!compact ? (
        <div className="rounded-md border border-line bg-white p-4">
          <h3 className="text-sm font-semibold text-ink">Layer legend</h3>
          <div className="mt-3 grid gap-2">
            {Object.entries(LAYERS).map(([key, layer]) => {
              const count = visibleNodes.filter((node) => node.layer === key).length;
              return (
                <div key={key} className="flex items-center justify-between rounded-md border border-line px-3 py-2 text-xs">
                  <span className={`rounded border px-2 py-1 font-semibold ${layer.tone}`}>{layer.short}</span>
                  <span className="min-w-0 flex-1 truncate px-3 text-zinc-700">{layer.label}</span>
                  <span className="text-zinc-500">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 rounded-md border border-line bg-white">
        {selectedNode ? (
          <>
            <div className="border-b border-line p-4">
              <div className="flex items-start gap-3">
                <span className={`rounded-md border p-2 ${LAYERS[selectedNode.layer].tone}`}>
                  <selectedNode.icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-ink">{selectedNode.title}</h3>
                  <p className="mt-1 text-xs leading-5 text-zinc-500">{selectedNode.description}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedNode.signals.map((signal) => (
                  <span key={signal} className="rounded border border-line bg-panel px-2 py-1 text-xs text-zinc-600">
                    {signal}
                  </span>
                ))}
              </div>
            </div>
            <div className="p-4">
              <div className="mb-2 flex items-center justify-between text-xs text-zinc-500">
                <span className="flex items-center gap-2 font-medium text-zinc-600">
                  <Files className="h-4 w-4" />
                  Files
                </span>
                <span>{formatBytes(selectedNodeSize)}</span>
              </div>
              <div className={compact ? "max-h-[calc(100vh-300px)] overflow-y-auto rounded-md border border-line" : "max-h-[360px] overflow-y-auto rounded-md border border-line"}>
                {selectedNode.paths.map((path) => (
                  <button
                    key={path}
                    type="button"
                    className="block w-full border-b border-line px-3 py-2 text-left text-xs last:border-b-0 hover:bg-panel"
                    onClick={() => onOpenFile(path)}
                  >
                    <span className="block truncate font-medium text-ink">{path}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="p-4 text-sm text-zinc-500">Pick a node to inspect its source files.</div>
        )}
      </div>
    </>
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto py-4">
      <div className="flex flex-col gap-4">
        <div className="rounded-md border border-line bg-white p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Network className="h-4 w-4 text-accent" />
                Architecture map
              </div>
              <p className="mt-1 text-sm leading-6 text-zinc-600">
                {selectedProject
                  ? `${selectedProject.name} mapped from the current file index.`
                  : "Select a project to build a live architecture map from its files."}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs sm:min-w-80">
              <div className="rounded-md border border-line bg-panel px-3 py-2">
                <span className="block text-zinc-500">Files</span>
                <span className="text-sm font-semibold text-ink">{isLoading ? "..." : files.length}</span>
              </div>
              <div className="rounded-md border border-line bg-panel px-3 py-2">
                <span className="block text-zinc-500">Frontend</span>
                <span className="text-sm font-semibold text-ink">{frontendCount}</span>
              </div>
              <div className="rounded-md border border-line bg-panel px-3 py-2">
                <span className="block text-zinc-500">Backend</span>
                <span className="text-sm font-semibold text-ink">{backendCount}</span>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-xs font-medium text-zinc-500">
              <SlidersHorizontal className="h-4 w-4" />
              Focus
            </div>
            <div className="grid rounded-md border border-line bg-panel p-1 text-sm sm:grid-cols-4">
              {FOCUS_LABELS.map((item) => (
                <button
                  key={item.mode}
                  type="button"
                  className={`rounded px-3 py-2 font-medium transition ${
                    focusMode === item.mode ? "bg-white text-ink shadow-sm" : "text-zinc-600 hover:text-ink"
                  }`}
                  onClick={() => {
                    setFocusMode(item.mode);
                    setSelectedNodeId("");
                  }}
                  disabled={!selectedProjectId}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid min-h-[620px] gap-4 xl:grid-cols-[1fr_340px]">
          <div className="min-h-[520px] overflow-hidden rounded-md border border-line bg-panel">
            {selectedProjectId && visibleNodes.length > 0 ? (
              <>
              <div className="grid gap-3 p-3 lg:hidden">
                {visibleNodes.map((node) => {
                  const Icon = node.icon;
                  const selected = selectedNode?.id === node.id;
                  return (
                    <button
                      key={node.id}
                      type="button"
                      className={`rounded-md border bg-white p-3 text-left shadow-sm transition ${
                        selected ? "border-accent ring-2 ring-teal-100" : "border-line"
                      }`}
                      onClick={() => setSelectedNodeId(node.id)}
                    >
                      <div className="flex items-start gap-2">
                        <span className={`rounded-md border p-2 ${LAYERS[node.layer].tone}`}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-ink">{node.title}</span>
                          <span className="mt-1 block text-xs leading-4 text-zinc-500">{node.subtitle}</span>
                        </span>
                      </div>
                      <div className="mt-3 flex items-center justify-between text-xs">
                        <span className={`rounded border px-2 py-1 font-semibold ${LAYERS[node.layer].tone}`}>
                          {LAYERS[node.layer].short}
                        </span>
                        <span className="text-zinc-500">{node.paths.length} files</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="relative">
                <button
                  type="button"
                  className="absolute right-3 top-3 z-10 hidden rounded-md border border-zinc-700 bg-zinc-900 p-2 text-zinc-300 shadow-sm transition hover:border-teal-300 hover:text-white lg:inline-flex"
                  onClick={() => setIsFullscreen(true)}
                  aria-label="Open architecture fullscreen"
                  title="Fullscreen"
                >
                  <Maximize2 className="h-4 w-4" />
                </button>
                {renderDiagram()}
              </div>
              </>
            ) : (
              <div className="flex h-full min-h-[520px] items-center justify-center text-center">
                <div className="max-w-sm px-5">
                  <p className="text-sm font-medium text-ink">
                    {isLoading ? "Mapping architecture..." : "Architecture map ready."}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-zinc-500">
                    {selectedProjectId
                      ? "The project file index is still loading or does not contain recognized source files."
                      : "Select a project first, then this view will draw the codebase layers."}
                  </p>
                </div>
              </div>
            )}
          </div>

          <aside className="flex min-h-0 flex-col gap-4">
            {renderInspector()}
          </aside>
        </div>
      </div>
      {isFullscreen ? (
        <div className="fixed inset-0 z-[9999] bg-zinc-950">
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-950 px-4 py-3 text-white">
              <div>
                <p className="text-sm font-semibold">Architecture map</p>
                <p className="text-xs text-zinc-400">{selectedProject?.name ?? "Selected project"}</p>
              </div>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-800"
                onClick={() => setIsFullscreen(false)}
              >
                <Minimize2 className="h-4 w-4" />
                Exit
              </button>
            </div>
            <div className="min-h-0 flex-1">
              {renderDiagram(true)}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
