import hashlib
import logging
import re

import chromadb
from chromadb.config import Settings as ChromaSettings

from app.core.config import settings
from app.services.embedding_provider import embed_text, embed_texts, embedding_signature


logging.getLogger("chromadb.telemetry.product.posthog").setLevel(logging.CRITICAL)

client = chromadb.PersistentClient(
    path=str(settings.chroma_dir),
    settings=ChromaSettings(anonymized_telemetry=False),
)


def collection_name(project_id: str) -> str:
    safe_project_id = project_id.replace("-", "_")
    safe_embedding = re.sub(r"[^a-zA-Z0-9_]+", "_", embedding_signature())
    if safe_embedding == "hash":
        return f"project_{safe_project_id}"

    embedding_hash = hashlib.sha256(safe_embedding.encode("utf-8")).hexdigest()[:12]
    return f"project_{safe_project_id[:8]}_{embedding_hash}"


def get_collection(project_id: str):
    return client.get_or_create_collection(
        name=collection_name(project_id),
        metadata={
            "project_id": project_id,
            "embedding_provider": embedding_signature(),
        },
    )


async def delete_collection(project_id: str) -> None:
    base_collection_name = f"project_{project_id.replace('-', '_')}"
    for collection in client.list_collections():
        collection_name_value = collection if isinstance(collection, str) else collection.name
        metadata = {}
        if isinstance(collection, str):
            try:
                metadata = client.get_collection(name=collection).metadata or {}
            except ValueError:
                metadata = {}
        else:
            metadata = collection.metadata or {}

        if (
            metadata.get("project_id") == project_id
            or collection_name_value == base_collection_name
            or collection_name_value.startswith(f"{base_collection_name}_")
        ):
            try:
                client.delete_collection(name=collection_name_value)
            except ValueError:
                pass


async def upsert_chunks(project_id: str, chunks: list[dict]) -> None:
    if not chunks:
        return

    collection = get_collection(project_id)
    collection.upsert(
        ids=[f"{chunk['file_path']}:{chunk['start_line']}" for chunk in chunks],
        embeddings=await embed_texts([chunk["content"] for chunk in chunks]),
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
        query_embeddings=[await embed_text(query)],
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
