import hashlib
import logging
import math
import re

import chromadb
from chromadb.config import Settings as ChromaSettings

from app.core.config import settings


EMBEDDING_DIMENSIONS = 384

logging.getLogger("chromadb.telemetry.product.posthog").setLevel(logging.CRITICAL)

client = chromadb.PersistentClient(
    path=str(settings.chroma_dir),
    settings=ChromaSettings(anonymized_telemetry=False),
)


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


def get_collection(project_id: str):
    return client.get_or_create_collection(name=collection_name(project_id))


async def delete_collection(project_id: str) -> None:
    try:
        client.delete_collection(name=collection_name(project_id))
    except ValueError:
        pass


async def upsert_chunks(project_id: str, chunks: list[dict]) -> None:
    if not chunks:
        return

    collection = get_collection(project_id)
    collection.upsert(
        ids=[f"{chunk['file_path']}:{chunk['start_line']}" for chunk in chunks],
        embeddings=[embed_text(chunk["content"]) for chunk in chunks],
        documents=[chunk["content"] for chunk in chunks],
        metadatas=[
            {
                "file_path": chunk["file_path"],
                "start_line": chunk["start_line"],
                "end_line": chunk["end_line"],
            }
            for chunk in chunks
        ],
    )


async def search_chunks(project_id: str, query: str, limit: int = 5) -> list[dict]:
    collection = get_collection(project_id)
    if collection.count() == 0:
        return []

    results = collection.query(
        query_embeddings=[embed_text(query)],
        n_results=limit,
    )

    documents = results.get("documents", [[]])[0]
    metadatas = results.get("metadatas", [[]])[0]

    return [
        {
            "file_path": metadata["file_path"],
            "start_line": metadata["start_line"],
            "end_line": metadata["end_line"],
            "content": document,
        }
        for document, metadata in zip(documents, metadatas)
    ]
