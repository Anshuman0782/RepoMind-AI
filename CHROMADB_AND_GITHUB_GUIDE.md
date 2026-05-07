# ChromaDB And GitHub Guide

This guide explains what ChromaDB is, what this project currently does, how to move from the current local vector index to real ChromaDB, and how to connect/push the project to GitHub.

## 1. What ChromaDB Is

ChromaDB is a vector database.

In normal databases, you usually search exact data like:

```text
Find user where email = "abc@example.com"
```

In a vector database, you search by meaning:

```text
Find code chunks similar to "where is authentication handled?"
```

The basic flow is:

1. Take project files.
2. Split them into smaller chunks.
3. Convert each chunk into an embedding, which is a list of numbers that represents meaning.
4. Store those embeddings in a vector database.
5. When the user asks a question, convert the question into an embedding.
6. Search for the most similar code chunks.
7. Send those chunks to the LLM so it can answer with project context.

For RepoMind AI, ChromaDB is useful because the assistant needs to understand a codebase, not just one file.

## 2. What This Project Does Right Now

The current backend does not use real ChromaDB yet.

Current file:

```text
backend/app/services/vector_store.py
```

Right now it uses:

- Local hash-based embeddings.
- A JSON file as the vector index.
- The folder configured by `chroma_dir`, defaulting to:

```text
backend/data/chroma
```

So when a project is indexed, the app stores records like this:

```json
{
  "id": "some/file.py:1",
  "embedding": [0.0, 0.1, -0.2],
  "chunk": {
    "file_path": "some/file.py",
    "start_line": 1,
    "end_line": 30,
    "content": "..."
  }
}
```

This is good for an MVP because it is simple and works without extra services. But it is not the final production-style vector storage.

## 3. Local JSON Index vs Actual ChromaDB

### Current Local JSON Index

Pros:

- Very easy to understand.
- No separate ChromaDB server needed.
- Good for learning and MVP testing.

Cons:

- Not fast for large repositories.
- Not suitable for many users/projects.
- No advanced vector database features.
- Embedding quality is basic because the current embedding function is hash-based.

### Actual ChromaDB

Pros:

- Built for vector search.
- Better for larger indexes.
- Supports persistent collections.
- Cleaner path toward production RAG features.

Cons:

- Needs a real embedding model.
- Adds a dependency.
- Requires careful setup for local vs deployed environments.

## 4. How To Shift From Local JSON To Actual ChromaDB

Use this as the migration plan.

### Step 1: Install ChromaDB

ChromaDB is already listed in the optional `agent` dependencies in:

```text
backend/pyproject.toml
```

Install optional agent dependencies:

```powershell
cd backend
uv sync --extra agent
```

If using pip instead:

```powershell
cd backend
pip install chromadb
```

### Step 2: Replace The JSON Storage

Update:

```text
backend/app/services/vector_store.py
```

Instead of writing JSON files, create a persistent Chroma client:

```python
import chromadb

from app.core.config import settings


client = chromadb.PersistentClient(path=str(settings.chroma_dir))
```

Then get one collection per project:

```python
def get_collection(project_id: str):
    return client.get_or_create_collection(name=collection_name(project_id))
```

### Step 3: Store Chunks In ChromaDB

The current `upsert_chunks` function should change from:

```python
index_path(project_id).write_text(json.dumps(records), encoding="utf-8")
```

To something like:

```python
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
```

### Step 4: Search ChromaDB

The current `search_chunks` function sorts JSON records manually.

With ChromaDB, use:

```python
collection = get_collection(project_id)
results = collection.query(
    query_embeddings=[embed_text(query)],
    n_results=limit,
)
```

Then convert Chroma results back into the same chunk shape the rest of the app expects:

```python
chunks = []

for document, metadata in zip(results["documents"][0], results["metadatas"][0]):
    chunks.append(
        {
            "file_path": metadata["file_path"],
            "start_line": metadata["start_line"],
            "end_line": metadata["end_line"],
            "content": document,
        }
    )
```

### Step 5: Upgrade Embeddings Later

The current `embed_text` function is useful for a free MVP, but real semantic search needs stronger embeddings.

Good future options:

- SentenceTransformers locally.
- Ollama embeddings locally.
- OpenAI/Gemini embeddings if using cloud APIs.

Recommended learning path:

1. Keep current hash embeddings until the app flow is stable.
2. Move storage from JSON to ChromaDB.
3. Then upgrade embeddings.

Do not change everything at once. Storage and embedding quality are separate concerns.

## 5. Local Development Setup

Start MongoDB:

```powershell
docker compose up -d
```

Start backend:

```powershell
cd backend
uv sync
copy .env.example .env
uv run uvicorn app.main:app --reload --port 8000
```

If `uv` has cache trouble on Windows:

```powershell
$env:UV_CACHE_DIR="C:\Users\USER\uv-cache-repomind"
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

Start frontend in another terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

## 6. Environment Files

Keep secrets in:

```text
backend/.env
```

Do not commit `.env` to GitHub.

Commit this instead:

```text
backend/.env.example
```

The project already has `.gitignore`, so keep checking that secrets and generated folders are ignored.

Useful environment values:

```env
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB=repomind
REPOS_DIR=./data/repos
CHROMA_DIR=./data/chroma
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1:8b
GROQ_API_KEY=
GEMINI_API_KEY=
```

## 7. GitHub Connection

This project already has a Git remote configured:

```text
origin  https://github.com/Anshuman0782/RepoMind-AI.git
```

Check it with:

```powershell
git remote -v
```

Check changed files:

```powershell
git status
```

Stage changes:

```powershell
git add .
```

Commit changes:

```powershell
git commit -m "Add ChromaDB and GitHub setup guide"
```

Push to GitHub:

```powershell
git push origin main
```

If your branch is not `main`, check it:

```powershell
git branch --show-current
```

Then push that branch:

```powershell
git push origin YOUR_BRANCH_NAME
```

## 8. Local To Actual Deployment Path

Here is the clean path from local MVP to real hosted app.

### Phase 1: Local MVP

- MongoDB runs using Docker.
- Backend runs with FastAPI locally.
- Frontend runs with Next.js locally.
- Vector index uses local JSON files.
- LLM uses Ollama, Groq, or Gemini.

### Phase 2: Real ChromaDB Locally

- Replace JSON vector index with ChromaDB persistent client.
- Keep Chroma data in `backend/data/chroma`.
- Keep the same backend API shape.
- Test indexing and chat again.

### Phase 3: Better Embeddings

- Replace hash embeddings with a real embedding model.
- Re-index projects after changing the embedding model.
- Keep old indexes separate or delete/rebuild them.

### Phase 4: Hosted Backend And Frontend

Possible hosting choices:

- Frontend: Vercel.
- Backend: Render, Railway, Fly.io, or a VPS.
- MongoDB: MongoDB Atlas.
- Vector database: ChromaDB persistent disk on backend server, or a managed vector database later.

For first deployment, keep it simple:

```text
Vercel frontend -> hosted FastAPI backend -> MongoDB Atlas -> ChromaDB persistent folder
```

### Phase 5: Production Cleanup

Before real users:

- Add authentication.
- Add repo/file size limits.
- Add background indexing jobs.
- Add better error handling.
- Add rate limits.
- Protect API keys.
- Avoid sending secrets or ignored files to the LLM.

## 9. Simple Mental Model

Think of RepoMind AI like this:

```text
GitHub repo
   -> file scanner
   -> code chunks
   -> embeddings
   -> vector store
   -> relevant chunks
   -> LLM answer
```

Right now the vector store is JSON.

Later the vector store becomes ChromaDB.

The rest of the app should not need to care too much as long as `upsert_chunks` and `search_chunks` keep returning the same kind of data.

