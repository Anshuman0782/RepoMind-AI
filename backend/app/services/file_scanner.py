from pathlib import Path


IGNORED_DIRS = {
    ".git",
    ".venv",
    "venv",
    "node_modules",
    "dist",
    "build",
    ".next",
    "__pycache__",
}

IGNORED_FILES = {".env", ".env.local"}

TEXT_EXTENSIONS = {
    ".astro",
    ".bash",
    ".c",
    ".cc",
    ".cfg",
    ".clj",
    ".cljs",
    ".cmake",
    ".conf",
    ".cpp",
    ".crt",
    ".cxx",
    ".c++",
    ".h",
    ".hh",
    ".hpp",
    ".hxx",
    ".h++",
    ".cs",
    ".csv",
    ".dart",
    ".env.example",
    ".erl",
    ".ex",
    ".exs",
    ".fs",
    ".fsx",
    ".go",
    ".graphql",
    ".gql",
    ".gradle",
    ".groovy",
    ".java",
    ".jl",
    ".kt",
    ".kts",
    ".less",
    ".lua",
    ".mjs",
    ".php",
    ".pl",
    ".proto",
    ".py",
    ".r",
    ".rb",
    ".rs",
    ".scala",
    ".sh",
    ".sql",
    ".svelte",
    ".swift",
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".vue",
    ".json",
    ".jsonc",
    ".lock",
    ".log",
    ".md",
    ".mdx",
    ".pem",
    ".properties",
    ".ps1",
    ".rst",
    ".txt",
    ".css",
    ".scss",
    ".sass",
    ".html",
    ".xml",
    ".yml",
    ".yaml",
    ".toml",
}

TEXT_FILE_NAMES = {
    ".dockerignore",
    ".editorconfig",
    ".gitattributes",
    ".gitignore",
    ".prettierrc",
    "CMakeLists.txt",
    "Dockerfile",
    "LICENSE",
    "Makefile",
    "Procfile",
}


def is_text_file_path(path: Path) -> bool:
    if path.name in TEXT_FILE_NAMES:
        return True
    lowered_name = path.name.lower()
    if lowered_name in {name.lower() for name in TEXT_FILE_NAMES}:
        return True
    if path.suffix.lower() in TEXT_EXTENSIONS:
        return True
    return any(lowered_name.endswith(extension) for extension in TEXT_EXTENSIONS if extension.count(".") > 1)


def iter_code_files(root: Path) -> list[Path]:
    files: list[Path] = []
    for path in root.rglob("*"):
        if any(part in IGNORED_DIRS for part in path.parts):
            continue
        if not path.is_file():
            continue
        if path.name in IGNORED_FILES:
            continue
        if is_text_file_path(path):
            files.append(path)
    return files


def chunk_file(path: Path, root: Path, max_lines: int = 80) -> list[dict]:
    text = path.read_text(encoding="utf-8", errors="ignore")
    lines = text.splitlines()
    chunks = []

    for index in range(0, len(lines), max_lines):
        chunk_lines = lines[index : index + max_lines]
        if not "".join(chunk_lines).strip():
            continue
        chunks.append(
            {
                "file_path": str(path.relative_to(root)).replace("\\", "/"),
                "start_line": index + 1,
                "end_line": index + len(chunk_lines),
                "content": "\n".join(chunk_lines),
            }
        )

    return chunks
