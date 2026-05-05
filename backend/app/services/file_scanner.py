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
    ".py",
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".json",
    ".md",
    ".txt",
    ".css",
    ".html",
    ".yml",
    ".yaml",
    ".toml",
}


def iter_code_files(root: Path) -> list[Path]:
    files: list[Path] = []
    for path in root.rglob("*"):
        if any(part in IGNORED_DIRS for part in path.parts):
            continue
        if not path.is_file():
            continue
        if path.name in IGNORED_FILES:
            continue
        if path.suffix.lower() in TEXT_EXTENSIONS:
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

