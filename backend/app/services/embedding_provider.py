import hashlib
import math
import re

import httpx

from app.core.config import settings


HASH_EMBEDDING_DIMENSIONS = 384


class EmbeddingProviderError(Exception):
    pass


def embedding_provider_name() -> str:
    return settings.embedding_provider.lower().strip()


def embedding_signature() -> str:
    provider = embedding_provider_name()
    if provider == "ollama":
        return f"ollama_{settings.ollama_embedding_model}"
    return provider


async def embed_text(text: str) -> list[float]:
    embeddings = await embed_texts([text])
    return embeddings[0]


async def embed_texts(texts: list[str]) -> list[list[float]]:
    provider = embedding_provider_name()
    if provider == "hash":
        return [_hash_embedding(text) for text in texts]
    if provider == "ollama":
        return await _ollama_embeddings(texts)
    raise EmbeddingProviderError(
        f"Unsupported EMBEDDING_PROVIDER={settings.embedding_provider!r}. "
        "Use 'hash' or 'ollama'."
    )


def _hash_embedding(text: str) -> list[float]:
    vector = [0.0] * HASH_EMBEDDING_DIMENSIONS
    tokens = re.findall(r"[a-zA-Z_][a-zA-Z0-9_]*", text.lower())

    for token in tokens:
        digest = hashlib.sha256(token.encode("utf-8")).digest()
        index = int.from_bytes(digest[:4], "big") % HASH_EMBEDDING_DIMENSIONS
        sign = 1.0 if digest[4] % 2 == 0 else -1.0
        vector[index] += sign

    return _normalize(vector)


def _normalize(vector: list[float]) -> list[float]:
    norm = math.sqrt(sum(value * value for value in vector))
    if norm == 0:
        return vector
    return [value / norm for value in vector]


async def _ollama_embeddings(texts: list[str]) -> list[list[float]]:
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.post(
                f"{settings.ollama_base_url}/api/embed",
                json={"model": settings.ollama_embedding_model, "input": texts},
            )
            response.raise_for_status()
            embeddings = response.json().get("embeddings")
            if embeddings:
                return embeddings
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            return await _legacy_ollama_embeddings(texts)
        raise EmbeddingProviderError(
            "Ollama embedding request failed. Check OLLAMA_BASE_URL and "
            f"OLLAMA_EMBEDDING_MODEL={settings.ollama_embedding_model}."
        ) from exc
    except httpx.HTTPError:
        return await _legacy_ollama_embeddings(texts)

    raise EmbeddingProviderError("Ollama did not return embeddings.")


async def _legacy_ollama_embeddings(texts: list[str]) -> list[list[float]]:
    embeddings = []
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            for text in texts:
                response = await client.post(
                    f"{settings.ollama_base_url}/api/embeddings",
                    json={"model": settings.ollama_embedding_model, "prompt": text},
                )
                response.raise_for_status()
                embedding = response.json().get("embedding")
                if not embedding:
                    raise EmbeddingProviderError("Ollama did not return an embedding.")
                embeddings.append(embedding)
    except httpx.HTTPError as exc:
        raise EmbeddingProviderError(
            "Could not create Ollama embeddings. Start Ollama and run "
            f"`ollama pull {settings.ollama_embedding_model}`, or set "
            "EMBEDDING_PROVIDER=hash in backend/.env."
        ) from exc
    return embeddings
