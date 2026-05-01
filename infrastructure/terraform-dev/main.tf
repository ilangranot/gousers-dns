terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    key            = "gousers/dev.tfstate"
    dynamodb_table = "gousers-terraform-lock"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "gousers"
      Environment = "dev"
      ManagedBy   = "terraform"
    }
  }
}

locals {
  prefix     = "gousers-dev"
  app_domain = "app.dev.${var.domain_name}"
  api_domain = "api.dev.${var.domain_name}"
}
