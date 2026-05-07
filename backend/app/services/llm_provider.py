import httpx
from groq import Groq
import google.generativeai as genai

from app.core.config import settings


SYSTEM_PROMPT = """You are RepoMind AI, a careful codebase assistant.
Answer using only the provided repository context when possible.
If context is insufficient, say what is missing.
When referencing code, include file paths and line numbers.
Do not invent files, libraries, or setup steps that are not in the context.
For JavaScript, remember that Math.floor and Math.random are built-in APIs and do not require external libraries.
If you provide code, keep it syntactically valid and directly tied to the referenced file."""


class LLMProviderError(Exception):
    pass


async def generate_answer(message: str, chunks: list[dict]) -> str:
    context = "\n\n".join(
        f"File: {chunk['file_path']} lines {chunk['start_line']}-{chunk['end_line']}\n{chunk['content']}"
        for chunk in chunks
    )
    prompt = f"{SYSTEM_PROMPT}\n\nRepository context:\n{context}\n\nUser question:\n{message}"

    provider = settings.llm_provider.lower()
    if provider == "mock":
        return _mock_answer(message, chunks)
    if provider == "groq":
        return await _groq(prompt)
    if provider == "gemini":
        return await _gemini(prompt)
    return await _ollama(prompt)


def _mock_answer(message: str, chunks: list[dict]) -> str:
    if not chunks:
        return (
            "Mock mode is working, but I could not find relevant indexed code for "
            f"your question: {message}"
        )

    source_lines = "\n".join(
        f"- {chunk['file_path']} lines {chunk['start_line']}-{chunk['end_line']}"
        for chunk in chunks
    )
    return (
        "Mock mode is working. I found relevant repository context for your question.\n\n"
        f"Question: {message}\n\n"
        f"Top sources:\n{source_lines}\n\n"
        "Switch LLM_PROVIDER to groq, gemini, or ollama when you want real AI answers."
    )


async def _ollama(prompt: str) -> str:
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                f"{settings.ollama_base_url}/api/generate",
                json={"model": settings.ollama_model, "prompt": prompt, "stream": False},
            )
            response.raise_for_status()
            return response.json().get("response", "")
    except httpx.HTTPError as exc:
        raise LLMProviderError(
            "Could not connect to Ollama. Start Ollama and run the selected model, "
            "or set LLM_PROVIDER=mock, groq, or gemini in backend/.env."
        ) from exc


async def _groq(prompt: str) -> str:
    if not settings.groq_api_key:
        raise LLMProviderError("GROQ_API_KEY is missing in backend/.env.")

    try:
        client = Groq(api_key=settings.groq_api_key)
        completion = client.chat.completions.create(
            model=settings.groq_model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
        )
        return completion.choices[0].message.content or ""
    except Exception as exc:
        raise LLMProviderError("Groq request failed. Check your API key and model name.") from exc


async def _gemini(prompt: str) -> str:
    if not settings.gemini_api_key:
        raise LLMProviderError("GEMINI_API_KEY is missing in backend/.env.")

    try:
        genai.configure(api_key=settings.gemini_api_key)
        model = genai.GenerativeModel(settings.gemini_model)
        response = model.generate_content(prompt)
        return response.text or ""
    except Exception as exc:
        raise LLMProviderError("Gemini request failed. Check your API key and model name.") from exc
