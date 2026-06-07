from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


PROJECT_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    app_name: str = "RepoMind AI"
    app_env: str = "development"
    mongodb_uri: str = "mongodb://localhost:27017"
    mongodb_db: str = "repomind"
    repos_dir: Path = PROJECT_ROOT / "data" / "repos"
    chroma_dir: Path = PROJECT_ROOT / "data" / "chroma"
    embedding_provider: str = "hash"
    ollama_embedding_model: str = "nomic-embed-text"
    llm_provider: str = "ollama"
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.1:8b"
    groq_api_key: str = ""
    groq_model: str = "llama-3.1-8b-instant"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-1.5-flash"
    github_client_id: str = ""
    github_client_secret: str = ""
    public_backend_url: str = "http://localhost:8001"
    frontend_url: str = "http://localhost:3000"
    jwt_secret_key: str = "repomind_secure_jwt_secret_key_2026_pilot"
    jwt_algorithm: str = "HS256"
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()
settings.repos_dir.mkdir(parents=True, exist_ok=True)
settings.chroma_dir.mkdir(parents=True, exist_ok=True)
