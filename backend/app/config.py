from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    SUPABASE_URL: str
    SUPABASE_SERVICE_ROLE_KEY: str
    SUPABASE_ANON_KEY: str = ""
    SUPABASE_JWT_SECRET: str

    OPENAI_API_KEY: str
    ANTHROPIC_API_KEY: str

    CLAUDE_MODEL: str = "claude-sonnet-4-20250514"
    EMBED_MODEL: str = "text-embedding-3-small"

    CORS_ORIGINS: str = "http://localhost:3000"
    PORT: int = 8000


@lru_cache
def get_settings() -> Settings:
    return Settings()
