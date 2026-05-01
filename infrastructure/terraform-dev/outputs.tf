output "dev_alb_dns_name" {
  description = "Dev ALB DNS name"
  value       = aws_lb.dev.dns_name
}

output "dev_app_url" {
  description = "Dev app URL"
  value       = "https://${local.app_domain}"
}

output "dev_api_url" {
  description = "Dev API URL"
  value       = "https://${local.api_domain}"
}

output "dev_ecs_cluster_name" {
  description = "Dev ECS cluster name"
  value       = aws_ecs_cluster.dev.name
}

output "dev_secrets_arn" {
  description = "ARN of the dev Secrets Manager secret"
  value       = aws_secretsmanager_secret.dev_app.arn
}
