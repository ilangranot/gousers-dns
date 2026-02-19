terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Partial backend config — supply bucket/key/region via -backend-config flags
  # or environment variables. See bootstrap.sh for one-time setup.
  backend "s3" {
    key            = "gousers/terraform.tfstate"
    dynamodb_table = "gousers-terraform-lock"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "gousers"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

locals {
  prefix = "gousers-${var.environment}"
  app_domain  = "app.${var.domain_name}"
  api_domain  = "api.${var.domain_name}"
}
