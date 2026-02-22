from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@db:5432/aigateway"
    REDIS_URL: str = "redis://redis:6379"

    CLERK_SECRET_KEY: str = ""
    CLERK_WEBHOOK_SECRET: str = ""

    # Generate with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    ENCRYPTION_KEY: str = ""

    OLLAMA_URL: str = "http://ollama:11434"
    OLLAMA_MODEL: str = "llama3.2"

    APP_ENV: str = "development"

    CORS_ORIGINS: str = "http://localhost:3000"

    # Comma-separated list of staff email addresses for super admin access
    STAFF_EMAILS: str = ""

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
