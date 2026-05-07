# RepoMind AI

RepoMind AI is a learning project for building a repo-aware AI coding assistant using free or local-friendly tools.

It lets a user import a GitHub repo or upload project files, index the codebase, ask questions about it, generate documentation, and later apply safe file edits with approval.

## Tech Stack

- Frontend: Next.js, TypeScript, Tailwind CSS
- Backend: FastAPI, Python
- App database: MongoDB
- Vector index: ChromaDB persistent local vector database
- Embeddings: provider-based embeddings, with local hash by default and Ollama optional
- LLM providers: Groq, Gemini, or Ollama
- Agent workflow: LangGraph in phase 2

## Project Structure

```text
.
|-- backend/
|   |-- app/
|   |   |-- api/
|   |   |-- core/
|   |   |-- models/
|   |   `-- services/
|   |-- data/
|   |-- requirements.txt
|   |-- requirements-agent.txt
|   `-- .env.example
|-- frontend/
|   |-- app/
|   |-- lib/
|   `-- package.json
`-- docker-compose.yml
```

## Local Setup

Start MongoDB:

```bash
docker compose up -d
```

Backend:

```bash
cd backend
uv sync
copy .env.example .env
uv run uvicorn app.main:app --reload --port 8000
```

If `uv` reports a cache error on Windows, use a custom cache path:

```powershell
$env:UV_CACHE_DIR="C:\Users\USER\uv-cache-repomind"
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

Optional phase-2 agent dependencies:

```bash
cd backend
uv sync --extra agent
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

## MVP Flow

1. Create a project from a GitHub URL.
2. Backend clones the repo into `backend/data/repos`.
3. Files are scanned and chunked.
4. Chunks are embedded locally and stored in ChromaDB.
5. User asks a question.
6. Backend retrieves relevant chunks.
7. LLM answers using Groq, Gemini, or Ollama.

## Safety Rules

- Ignore `.env`, `.git`, `node_modules`, `dist`, `build`, and binary files.
- Never expose secrets to the LLM.
- Do not edit files without user approval.
- Show diffs before applying modifications.
- Run code only in a sandboxed worker in later phases.
