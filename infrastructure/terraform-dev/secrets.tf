locals {
  dev_secrets = {
    DATABASE_URL         = "postgresql+asyncpg://${var.db_username}:${var.dev_db_password}@${var.prod_rds_endpoint}:5432/${var.dev_db_name}"
    REDIS_URL            = "redis://${var.prod_redis_endpoint}:6379/1"
    AUTH_SECRET          = var.auth_secret
    ENCRYPTION_KEY       = var.dev_encryption_key
    APP_ENV              = "dev"
    CORS_ORIGINS         = "https://${local.app_domain},https://${var.domain_name}"
    STAFF_EMAILS         = var.staff_emails
    EMAIL_BACKEND        = "ses"
    SES_FROM_EMAIL       = "noreply@${var.domain_name}"
    SES_REGION           = var.aws_region
    APP_BASE_URL         = "https://${local.app_domain}"
    # No OLLAMA_URL — dev skips semantic filtering to save cost
  }
}

resource "aws_secretsmanager_secret" "dev_app" {
  name                    = "gousers-dev/app-secrets"
  description             = "GoUsers dev environment variables"
  recovery_window_in_days = 0  # Allow immediate deletion for dev
}

resource "aws_secretsmanager_secret_version" "dev_app" {
  secret_id     = aws_secretsmanager_secret.dev_app.id
  secret_string = jsonencode(local.dev_secrets)
}
