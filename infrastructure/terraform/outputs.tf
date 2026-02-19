output "alb_dns_name" {
  description = "ALB DNS name (use for verification before DNS propagates)"
  value       = aws_lb.main.dns_name
}

output "app_url" {
  description = "Application URL"
  value       = "https://${local.app_domain}"
}

output "api_url" {
  description = "API URL"
  value       = "https://${local.api_domain}"
}

output "ecr_api_url" {
  description = "ECR repository URL for the API image"
  value       = aws_ecr_repository.api.repository_url
}

output "ecr_web_url" {
  description = "ECR repository URL for the Web image"
  value       = aws_ecr_repository.web.repository_url
}

output "rds_endpoint" {
  description = "RDS PostgreSQL endpoint"
  value       = aws_db_instance.main.address
  sensitive   = true
}

output "redis_endpoint" {
  description = "ElastiCache Redis endpoint"
  value       = aws_elasticache_cluster.main.cache_nodes[0].address
  sensitive   = true
}

output "ollama_private_ip" {
  description = "Private IP of the Ollama EC2 instance"
  value       = aws_instance.ollama.private_ip
}

output "secrets_manager_arn" {
  description = "ARN of the Secrets Manager secret"
  value       = aws_secretsmanager_secret.app.arn
}

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.main.name
}
