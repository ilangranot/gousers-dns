variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "domain_name" {
  description = "Root domain (e.g. gousers.com)"
  type        = string
}

variable "hosted_zone_id" {
  description = "Route53 hosted zone ID"
  type        = string
}

# ── Database ────────────────────────────────────────────────────────────────────
variable "dev_db_password" {
  description = "Postgres password (same as prod RDS, used to build the connection string)"
  type        = string
  sensitive   = true
}

variable "dev_db_name" {
  description = "Dev database name on the shared prod RDS"
  type        = string
  default     = "aigateway_dev"
}

variable "db_username" {
  description = "Postgres username"
  type        = string
  default     = "postgres"
}

variable "prod_rds_endpoint" {
  description = "Prod RDS endpoint (output from prod terraform)"
  type        = string
}

variable "prod_redis_endpoint" {
  description = "Prod ElastiCache Redis endpoint (output from prod terraform)"
  type        = string
}

# ── Auth.js ────────────────────────────────────────────────────────────────────
variable "auth_secret" {
  description = "Auth.js secret (openssl rand -base64 32)"
  type        = string
  sensitive   = true
}

# ── App secrets ────────────────────────────────────────────────────────────────
variable "dev_encryption_key" {
  description = "Fernet encryption key for dev environment"
  type        = string
  sensitive   = true
}

# ── Prod VPC reference ─────────────────────────────────────────────────────────
variable "prod_vpc_name_tag" {
  description = "Name tag of the prod VPC to look up"
  type        = string
  default     = "gousers-prod-vpc"
}

variable "staff_emails" {
  description = "Comma-separated list of staff email addresses for super admin access"
  type        = string
  default     = ""
}

# ── Prod security groups (for cross-SG rules) ───────────────────────────────
variable "prod_rds_sg_id" {
  description = "Security group ID of the prod RDS instance"
  type        = string
  default     = "sg-0aeab6cdd54bfe2a8"
}

variable "prod_redis_sg_id" {
  description = "Security group ID of the prod Redis/ElastiCache cluster"
  type        = string
  default     = "sg-090d049ffc7e72cdc"
}
