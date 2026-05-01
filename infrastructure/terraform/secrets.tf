locals {
  # All application environment variables stored as a single JSON secret.
  # ECS tasks reference individual keys via secrets injection.
  app_secrets = {
    DATABASE_URL         = "postgresql+asyncpg://${var.db_username}:${var.db_password}@${aws_db_instance.main.address}:5432/${var.db_name}"
    REDIS_URL            = "redis://${aws_elasticache_cluster.main.cache_nodes[0].address}:6379"
    AUTH_SECRET          = var.auth_secret
    ENCRYPTION_KEY       = var.encryption_key
    OLLAMA_URL           = "http://${aws_instance.ollama.private_ip}:11434"
    OLLAMA_MODEL         = var.ollama_model
    APP_ENV              = var.environment
    CORS_ORIGINS         = "https://${local.app_domain}"
    EMAIL_BACKEND        = "ses"
    SES_FROM_EMAIL       = var.ses_from_email
    SES_REGION           = var.aws_region
    APP_BASE_URL         = "https://${local.app_domain}"
    STAFF_EMAILS         = var.staff_emails
    NEXTAUTH_URL         = "https://${local.app_domain}"
    API_INTERNAL_URL     = "https://${local.api_domain}"
  }
}

resource "aws_secretsmanager_secret" "app" {
  name                    = "${local.prefix}/app-secrets"
  description             = "GoUsers application environment variables"
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "app" {
  secret_id     = aws_secretsmanager_secret.app.id
  secret_string = jsonencode(local.app_secrets)
}
