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
  experience: { label: "Experience", short: "UX", tone: "border-teal-500/30 bg-teal-950/20 text-teal-300" },
  client: { label: "Client logic", short: "UI", tone: "border-sky-500/30 bg-sky-950/20 text-sky-300" },
  edge: { label: "API boundary", short: "API", tone: "border-violet-500/30 bg-violet-950/20 text-violet-300" },
  services: { label: "Agent services", short: "SVC", tone: "border-amber-500/30 bg-amber-950/20 text-amber-300" },
  data: { label: "Data and storage", short: "DATA", tone: "border-emerald-500/30 bg-emerald-950/20 text-emerald-300" },
  project: { label: "Project shell", short: "OPS", tone: "border-zinc-700 bg-zinc-800/40 text-zinc-300" },
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
    <div className={`hidden overflow-auto bg-brand-bg lg:block ${fullscreen ? "h-full p-6" : "p-4"}`}>
      <div
        className={`relative rounded-md border border-line/25 bg-brand-bg ${fullscreen ? "mx-auto" : ""}`}
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
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#8b5cf6" />
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
                  stroke="rgba(139, 92, 246, 0.35)"
                  strokeWidth="1.6"
                  markerEnd={`url(#${fullscreen ? "architecture-arrow-fullscreen" : "architecture-arrow"})`}
                />
                <text
                  x={labelX}
                  y={labelY}
                  textAnchor="middle"
                  className="fill-textMuted font-mono text-[9px] uppercase tracking-wider font-bold"
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
              className={`absolute rounded-xl border px-4 py-3 text-left shadow-lg transition-all duration-200 hover:border-accent hover:bg-line/20 ${
                selected ? "border-accent bg-accent-dim ring-2 ring-accent/30 shadow-lg shadow-accent/10" : "border-line/25 bg-panel hover:border-accent"
              }`}
              style={{ left: x, top: y, width: NODE_WIDTH, minHeight: NODE_HEIGHT }}
              onClick={() => setSelectedNodeId(node.id)}
            >
              <span className="flex items-center gap-2">
                <Icon className={selected ? "h-4 w-4 text-accent" : "h-4 w-4 text-textSecondary"} />
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink">
                  {node.title}
                </span>
              </span>
              <span className="mt-2 flex items-center justify-between gap-2 text-[10px] text-textSecondary font-medium">
                <span className="truncate">{LAYERS[node.layer].label}</span>
                <span className="text-textMuted font-bold">{node.paths.length} files</span>
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
        <div className="rounded-xl border border-line/20 bg-brand-sidebar/40 p-4">
          <h3 className="text-sm font-semibold text-textPrimary">Layer legend</h3>
          <div className="mt-3 grid gap-2">
            {Object.entries(LAYERS).map(([key, layer]) => {
              const count = visibleNodes.filter((node) => node.layer === key).length;
              return (
                <div key={key} className="flex items-center justify-between rounded-lg border border-line/10 px-3 py-2 text-xs">
                  <span className={`rounded border px-2 py-1 font-semibold ${layer.tone}`}>{layer.short}</span>
                  <span className="min-w-0 flex-1 truncate px-3 text-textSecondary font-medium">{layer.label}</span>
                  <span className="text-textMuted font-bold">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
 
      <div className="min-h-0 flex-1 rounded-xl border border-line/20 bg-brand-sidebar/40 flex flex-col">
        {selectedNode ? (
          <>
            <div className="border-b border-line/15 p-4 bg-brand-sidebar/20">
              <div className="flex items-start gap-3">
                <span className={`rounded-lg border p-2 ${LAYERS[selectedNode.layer].tone}`}>
                  <selectedNode.icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-bold text-textPrimary">{selectedNode.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-textSecondary">{selectedNode.description}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {selectedNode.signals.map((signal) => (
                  <span key={signal} className="rounded border border-line/15 bg-brand-bg px-2 py-0.5 text-[10px] font-mono text-textSecondary">
                    {signal}
                  </span>
                ))}
              </div>
            </div>
            <div className="p-4 flex-1 flex flex-col min-h-0">
              <div className="mb-2.5 flex items-center justify-between text-xs text-textSecondary">
                <span className="flex items-center gap-2 font-bold text-textPrimary">
                  <Files className="h-4 w-4 text-accent" />
                  Files
                </span>
                <span className="font-mono text-[10px] text-textMuted">{formatBytes(selectedNodeSize)}</span>
              </div>
              <div className={`overflow-y-auto rounded-lg border border-line/15 bg-brand-bg divide-y divide-line/15 ${
                compact ? "max-h-[calc(100vh-300px)]" : "max-h-[300px]"
              }`}>
                {selectedNode.paths.map((path) => (
                  <button
                    key={path}
                    type="button"
                    className="block w-full px-3 py-2 text-left text-xs text-textSecondary hover:bg-line/15 hover:text-ink transition font-mono truncate"
                    onClick={() => onOpenFile(path)}
                  >
                    📄 {path}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="p-6 text-xs text-textMuted italic text-center">Pick a map node to inspect its files.</div>
        )}
      </div>
    </>
  );


  return (
    <div className="min-h-0 flex-1 overflow-y-auto py-4">
      <div className="flex flex-col gap-4">
        {/* Info panel */}
        <div className="rounded-xl border border-line/20 bg-brand-sidebar/40 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-textPrimary">
                <Network className="h-4 w-4 text-accent animate-pulse" />
                Architecture Map
              </div>
              <p className="mt-1 text-xs leading-relaxed text-textSecondary">
                {selectedProject
                  ? `Dependency mapping parsed from the current files of "${selectedProject.name}".`
                  : "Select a workspace to map files into layers."}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs sm:min-w-80">
              <div className="rounded-lg border border-line/15 bg-brand-bg px-3 py-2">
                <span className="block text-[10px] text-textMuted font-bold uppercase tracking-wider">Files</span>
                <span className="text-sm font-bold text-textPrimary">{isLoading ? "..." : files.length}</span>
              </div>
              <div className="rounded-lg border border-line/15 bg-brand-bg px-3 py-2">
                <span className="block text-[10px] text-textMuted font-bold uppercase tracking-wider">Frontend</span>
                <span className="text-sm font-bold text-textPrimary">{frontendCount}</span>
              </div>
              <div className="rounded-lg border border-line/15 bg-brand-bg px-3 py-2">
                <span className="block text-[10px] text-textMuted font-bold uppercase tracking-wider">Backend</span>
                <span className="text-sm font-bold text-textPrimary">{backendCount}</span>
              </div>
            </div>
          </div>
 
          <div className="mt-4 flex flex-col gap-3 border-t border-line/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-textSecondary">
              <SlidersHorizontal className="h-4 w-4 text-accent" />
              Focus Layer
            </div>
            <div className="flex flex-wrap gap-1 rounded-xl border border-line/15 bg-brand-sidebar p-1 text-xs">
              {FOCUS_LABELS.map((item) => (
                <button
                  key={item.mode}
                  type="button"
                  className={`rounded-lg px-3.5 py-1.5 font-semibold transition-all ${
                    focusMode === item.mode
                      ? "bg-accent text-white shadow-md shadow-accent/20"
                      : "text-textSecondary hover:text-ink"
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

        <div className="grid min-h-[560px] gap-4 xl:grid-cols-[1fr_320px]">
          {/* Main Visual Map Container */}
          <div className="min-h-[460px] overflow-hidden rounded-xl border border-line/20 bg-brand-sidebar/10 flex flex-col">
            {selectedProjectId && visibleNodes.length > 0 ? (
              <>
                {/* Mobile list fallback */}
                <div className="grid gap-2 p-3 lg:hidden overflow-y-auto max-h-[300px]">
                  {visibleNodes.map((node) => {
                    const Icon = node.icon;
                    const selected = selectedNode?.id === node.id;
                    return (
                      <button
                        key={node.id}
                        type="button"
                        className={`rounded-xl border p-3 text-left shadow transition-all duration-150 ${
                          selected ? "border-accent bg-accent-dim ring-2 ring-accent/25" : "border-line/15 bg-panel"
                        }`}
                        onClick={() => setSelectedNodeId(node.id)}
                      >
                        <div className="flex items-start gap-2">
                          <span className={`rounded-lg border p-1.5 ${LAYERS[node.layer].tone}`}>
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-bold text-textPrimary">{node.title}</span>
                            <span className="mt-0.5 block text-[10px] text-textSecondary leading-normal">{node.subtitle}</span>
                          </span>
                        </div>
                        <div className="mt-2.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-textMuted">
                          <span className={`rounded px-1.5 py-0.5 ${LAYERS[node.layer].tone}`}>
                            {LAYERS[node.layer].short}
                          </span>
                          <span>{node.paths.length} files</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
 
                {/* Desktop SVG Map */}
                <div className="relative flex-1 hidden lg:block">
                  <button
                    type="button"
                    className="absolute right-4 top-4 z-10 rounded-lg border border-line/35 bg-brand-bg p-2.5 text-textSecondary shadow-md hover:border-accent hover:text-ink transition"
                    onClick={() => setIsFullscreen(true)}
                    aria-label="Open architecture fullscreen"
                    title="Fullscreen Mode"
                  >
                    <Maximize2 className="h-4 w-4" />
                  </button>
                  {renderDiagram()}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-center p-6 min-h-[400px]">
                <div className="max-w-sm">
                  <p className="text-sm font-semibold text-textPrimary">
                    {isLoading ? "Mapping layers..." : "Architecture Mapper Active"}
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-textSecondary">
                    {selectedProjectId
                      ? "Files are currently loading, or we couldn't classify any codebase source layers."
                      : "Load a workspace in the sidebar to build a responsive SVG architecture diagram."}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Map Side Inspector */}
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
