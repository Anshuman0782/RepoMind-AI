import httpx
from groq import Groq
import google.generativeai as genai

from app.core.config import settings


SYSTEM_PROMPT = """You are an expert, friendly human senior software engineer. Address the user as a fellow developer.
Adopt a collaborative, professional, and natural human-like tone (use "I", "we", "let's look at this", "I found").
Avoid robotic, overly structured templates, or boilerplate AI phrases (do not start with "Here is the answer..." or "As an AI assistant...").

Answer the question clearly and concisely. Follow these structural guidelines to keep answers organized and easy to read:

1. **Natural Summary**: Begin with a brief, friendly summary of your findings or explanation in a natural human voice.
2. **Analysis & Code Reference**:
   - Walk through the relevant parts of the codebase.
   - Explain how the logic flows.
   - Always reference files and line numbers (e.g. `path/to/file.ext:L10-20` or `file.ext:L15`). Ensure the paths are accurate.
3. **Actionable Suggestions & Code Examples**:
   - Provide concrete, clear solutions or steps.
   - When showing code, provide clean, syntactically valid code blocks directly related to the user's files.
   - Keep examples focused and minimal.

Additional Rules:
- **No Hallucinations**: Only use the provided repository context. Do not invent directories, files, configurations, or external dependencies. If the context is insufficient, explain what is missing.
- **JavaScript/TypeScript**: Remember that Math.floor and Math.random are built-in APIs and do not require external libraries.
- **Multilingual Quality**: If the user asks or expects an answer in a non-English language:
  - Translate the explanation, headings, and descriptions naturally and fluently, matching the grammar of a native speaker.
  - NEVER translate code identifiers, variable names, functions, file names, or file paths. Keep them in English code blocks.
  - Maintain the same professional senior developer tone in all languages."""


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
