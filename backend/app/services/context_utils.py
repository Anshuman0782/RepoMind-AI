import re

from app.services.codebase_tools import read_file


def mentioned_file_paths(message: str, limit: int = 3) -> list[str]:
    candidates = re.findall(
        r"(?:`([^`]+\.[A-Za-z0-9+]+)`|(?:file|path|module)\s*[:=]?\s*([A-Za-z0-9_./\\+-]+\.[A-Za-z0-9+]+)|(?<![A-Za-z0-9_./\\+-])([A-Za-z0-9_./\\+-]+\.[A-Za-z0-9+]+)(?![A-Za-z0-9_./\\+-]))",
        message,
        flags=re.IGNORECASE,
    )
    paths = []
    seen = set()
    ignored_extensions = {".com", ".org", ".net", ".dev", ".io"}
    for groups in candidates:
        raw_path = next((value for value in groups if value), "")
        path = raw_path.strip().strip(".,:;()[]{}\"'").replace("\\", "/")
        if not path or path.startswith("http://") or path.startswith("https://"):
            continue
        extension = f".{path.rsplit('.', 1)[-1].lower()}"
        if extension in ignored_extensions:
            continue
        lowered = path.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        paths.append(path)
    return paths[:limit]


async def full_file_chunks_for_message(project_id: str, message: str, limit: int = 3) -> list[dict]:
    chunks = []
    seen = set()
    for path in mentioned_file_paths(message, limit=limit):
        try:
            file_content = await read_file(project_id, path)
        except (FileNotFoundError, ValueError):
            continue

        key = file_content["path"].lower()
        if key in seen:
            continue
        seen.add(key)
        chunks.append(
            {
                "file_path": file_content["path"],
                "start_line": 1,
                "end_line": file_content["line_count"],
                "content": file_content["content"],
            }
        )
    return chunks


def merge_context_chunks(primary: list[dict], secondary: list[dict], limit: int | None = None) -> list[dict]:
    merged = []
    seen = set()
    for chunk in [*primary, *secondary]:
        key = (chunk["file_path"], chunk["start_line"], chunk["end_line"], chunk["content"])
        if key in seen:
            continue
        seen.add(key)
        merged.append(chunk)
    return merged[:limit] if limit is not None else merged
