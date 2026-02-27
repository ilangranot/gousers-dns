from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@db:5432/aigateway"
    REDIS_URL: str = "redis://redis:6379"

    AUTH_SECRET: str = ""

    # Generate with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    ENCRYPTION_KEY: str = ""

    OLLAMA_URL: str = "http://ollama:11434"
    OLLAMA_MODEL: str = "llama3.2"

    APP_ENV: str = "development"

    CORS_ORIGINS: str = "http://localhost:3000"

    # Comma-separated list of staff email addresses for super admin access
    STAFF_EMAILS: str = ""

    # Base URL for generating links in emails (e.g. password reset)
    APP_BASE_URL: str = "http://localhost:3000"

    # Email backend: "ses" | "smtp" | "log" (default)
    # "ses"  — uses boto3 via the ECS task IAM role (no credentials needed in prod)
    # "smtp" — aiosmtplib, configure SMTP_* vars below
    # "log"  — prints the link to stdout (local dev)
    EMAIL_BACKEND: str = "log"

    # SES settings (used when EMAIL_BACKEND=ses)
    SES_FROM_EMAIL: str = "noreply@gousers.com"
    SES_REGION: str = "us-east-1"

    # SMTP settings (used when EMAIL_BACKEND=smtp)
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = "noreply@gousers.com"

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
