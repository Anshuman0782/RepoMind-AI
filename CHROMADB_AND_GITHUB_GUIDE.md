# ChromaDB And GitHub Guide

This guide explains what ChromaDB is, what this project currently does, how embeddings are selected for local/cloud use, and how to connect/push the project to GitHub.

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

The backend now uses real ChromaDB for vector storage.

Current file:

```text
backend/app/services/vector_store.py
```

Embedding provider file:

```text
backend/app/services/embedding_provider.py
```

Right now the app uses:

- ChromaDB persistent storage.
- Provider-based embeddings.
- `hash` embeddings by default.
- Optional Ollama embeddings for better local semantic search.
- The folder configured by `chroma_dir`, defaulting to:

```text
backend/data/chroma
```

So when a project is indexed, the app stores each chunk in ChromaDB with:

```json
{
  "id": "some/file.py:1",
  "document": "chunk content...",
  "embedding": [0.0, 0.1, -0.2],
  "metadata": {
    "file_path": "some/file.py",
    "start_line": 1,
    "end_line": 30
  }
}
```

The default `hash` embedding mode is good for an MVP because it works without extra services. For better meaning-based search, use Ollama embeddings locally or add a cloud embedding provider later.

## 3. Local JSON Index vs Actual ChromaDB

### Previous Local JSON Index

Pros:

- Very easy to understand.
- No separate ChromaDB server needed.
- Good for learning and MVP testing.

Cons:

- Not fast for large repositories.
- Not suitable for many users/projects.
- No advanced vector database features.
- Embedding quality is basic because the current embedding function is hash-based.

### Current Actual ChromaDB

Pros:

- Built for vector search.
- Better for larger indexes.
- Supports persistent collections.
- Cleaner path toward production RAG features.

Cons:

- Needs a real embedding model.
- Adds a dependency.
- Requires careful setup for local vs deployed environments.

## 4. How The Current ChromaDB Setup Works

The migration from JSON to ChromaDB has already been done.

### Runtime Dependency

ChromaDB is now a normal backend dependency in:

```text
backend/pyproject.toml
backend/requirements.txt
```

Install backend dependencies:

```powershell
cd backend
uv sync
```

If using pip instead:

```powershell
cd backend
pip install chromadb
```

### Chroma Client

The backend creates a persistent ChromaDB client in:

```text
backend/app/services/vector_store.py
```

```python
client = chromadb.PersistentClient(...)
```

### Project Collections

The app creates one Chroma collection per project and embedding provider.

For default hash embeddings:

```text
project_<project_id>
```

For Ollama embeddings:

```text
project_<project_id_prefix>_<embedding_signature_hash>
```

The provider/model part is shortened with a deterministic hash so ChromaDB collection names stay under the 63-character limit. This matters because different embedding models can produce vectors with different dimensions. Keeping separate collections avoids ChromaDB dimension conflicts.

### Store Chunks

```python
await upsert_chunks(project_id, chunks)
```

Internally, this stores:

- ids
- embeddings
- documents
- metadata

### Search Chunks

```python
await search_chunks(project_id, query, limit=5)
```

This returns the same chunk shape the rest of the app already expects:

```json
{
  "file_path": "some/file.py",
  "start_line": 1,
  "end_line": 30,
  "content": "..."
}
```

### Re-index Existing Projects

After changing the embedding provider or embedding model, re-index existing projects:

```text
POST /api/projects/<project_id>/reindex
```

The app also has a project sidebar `Index` button for this.

Re-indexing does this:

1. Loads the existing project from MongoDB.
2. Re-scans the local repo folder.
3. Deletes old ChromaDB collections for that project.
4. Stores fresh chunks with the current embedding provider.
5. Updates project status, file count, and chunk count.

If re-indexing fails, the project status becomes:

```text
index_failed
```

## 5. Embedding Provider Setup

Embeddings are controlled by environment variables.

Default local MVP mode:

```env
EMBEDDING_PROVIDER=hash
```

Better local semantic mode:

```env
EMBEDDING_PROVIDER=ollama
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
```

Before using Ollama embeddings locally, install the model:

```powershell
ollama pull nomic-embed-text
```

Then restart the backend and re-index projects.

Important: if you change the embedding provider or embedding model, re-index the project. Old embeddings and new embeddings should not be mixed.

## 6. Local vs Cloud Embeddings

### Local Development

Use:

```env
EMBEDDING_PROVIDER=hash
```

or:

```env
EMBEDDING_PROVIDER=ollama
```

`hash` is easiest. `ollama` gives better search but requires Ollama running on your machine.

### Cloud Deployment

On AWS or another cloud, you have three paths:

1. Run Ollama on the same server as the backend.
2. Use a cloud embedding API such as OpenAI, Gemini, or Cohere.
3. Use a managed vector database later if scale grows.

Recommended early cloud path:

```text
Frontend -> FastAPI backend -> cloud embedding API -> ChromaDB or managed vector DB
```

The code now has a provider layer, so adding cloud embeddings later should happen in:

```text
backend/app/services/embedding_provider.py
```

Do not put cloud API logic inside `vector_store.py`. Keep ChromaDB storage and embedding generation separate.

## 7. Local Development Setup

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
EMBEDDING_PROVIDER=hash
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1:8b
GROQ_API_KEY=
GEMINI_API_KEY=
```

## 8. GitHub Connection

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

## 9. Local To Actual Deployment Path

Here is the clean path from local MVP to real hosted app.

### Phase 1: Local MVP

- MongoDB runs using Docker.
- Backend runs with FastAPI locally.
- Frontend runs with Next.js locally.
- Vector index uses ChromaDB.
- Embeddings use `hash` by default.
- LLM uses Ollama, Groq, or Gemini.

### Phase 2: Better Local Embeddings

- Set `EMBEDDING_PROVIDER=ollama`.
- Pull `nomic-embed-text`.
- Restart backend.
- Re-index projects.

### Phase 3: Cloud-Friendly Embeddings

- Add a cloud embedding provider in `embedding_provider.py`.
- Keep ChromaDB logic unchanged.
- Use environment variables to switch provider.

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

## 10. Simple Mental Model

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

Now the vector store is ChromaDB.

Embeddings are provider-based:

```text
hash now -> Ollama locally -> cloud provider later
```

The rest of the app should not need to care too much as long as `upsert_chunks` and `search_chunks` keep returning the same kind of data.
