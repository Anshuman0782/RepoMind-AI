import hashlib
import json
import math
import re

from app.core.config import settings


EMBEDDING_DIMENSIONS = 384


def embed_text(text: str) -> list[float]:
    vector = [0.0] * EMBEDDING_DIMENSIONS
    tokens = re.findall(r"[a-zA-Z_][a-zA-Z0-9_]*", text.lower())

    for token in tokens:
        digest = hashlib.sha256(token.encode("utf-8")).digest()
        index = int.from_bytes(digest[:4], "big") % EMBEDDING_DIMENSIONS
        sign = 1.0 if digest[4] % 2 == 0 else -1.0
        vector[index] += sign

    norm = math.sqrt(sum(value * value for value in vector))
    if norm == 0:
        return vector
    return [value / norm for value in vector]


def collection_name(project_id: str) -> str:
    return f"project_{project_id.replace('-', '_')}"


def index_path(project_id: str):
    return settings.chroma_dir / f"{collection_name(project_id)}.json"


def cosine_similarity(left: list[float], right: list[float]) -> float:
    return sum(left_value * right_value for left_value, right_value in zip(left, right))


async def upsert_chunks(project_id: str, chunks: list[dict]) -> None:
    if not chunks:
        return

    records = []
    for chunk in chunks:
        records.append(
            {
                "id": f"{chunk['file_path']}:{chunk['start_line']}",
                "embedding": embed_text(chunk["content"]),
                "chunk": chunk,
            }
        )

    index_path(project_id).write_text(json.dumps(records), encoding="utf-8")


async def search_chunks(project_id: str, query: str, limit: int = 5) -> list[dict]:
    path = index_path(project_id)
    if not path.exists():
        return []

    records = json.loads(path.read_text(encoding="utf-8"))
    query_embedding = embed_text(query)

    ranked = sorted(
        records,
        key=lambda record: cosine_similarity(query_embedding, record["embedding"]),
        reverse=True,
    )

    return [record["chunk"] for record in ranked[:limit]]
