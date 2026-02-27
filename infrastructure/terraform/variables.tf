variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment name"
  type        = string
  default     = "prod"
}

variable "domain_name" {
  description = "Root domain name (e.g. yourdomain.com)"
  type        = string
}

variable "hosted_zone_id" {
  description = "Route53 hosted zone ID for domain_name"
  type        = string
}

# ── Database ────────────────────────────────────────────────────────────────────
variable "db_password" {
  description = "Master password for RDS PostgreSQL"
  type        = string
  sensitive   = true
}

variable "db_username" {
  description = "Master username for RDS PostgreSQL"
  type        = string
  default     = "postgres"
}

variable "db_name" {
  description = "Database name"
  type        = string
  default     = "aigateway"
}

# ── Auth.js ────────────────────────────────────────────────────────────────────
variable "auth_secret" {
  description = "Auth.js secret (openssl rand -base64 32)"
  type        = string
  sensitive   = true
}

# ── App secrets ────────────────────────────────────────────────────────────────
variable "encryption_key" {
  description = "Fernet encryption key for sensitive data at rest"
  type        = string
  sensitive   = true
}

# ── Ollama ─────────────────────────────────────────────────────────────────────
variable "ollama_instance_type" {
  description = "EC2 instance type for Ollama"
  type        = string
  default     = "t3.large"
}

variable "ollama_model" {
  description = "Ollama model to pre-pull on startup"
  type        = string
  default     = "llama3.2"
}

# ── Email ───────────────────────────────────────────────────────────────────────
variable "ses_from_email" {
  description = "Sender address for transactional emails (must be in the verified SES domain)"
  type        = string
  default     = "noreply@gousers.com"
}

variable "staff_emails" {
  description = "Comma-separated staff email addresses for super admin access"
  type        = string
  default     = ""
}

variable "ollama_ami" {
  description = "AMI ID for the Ollama EC2 instance (Amazon Linux 2023)"
  type        = string
  default     = "ami-0c02fb55956c7d316" # us-east-1 AL2023; override for other regions
}
