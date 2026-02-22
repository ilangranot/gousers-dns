# Look up the existing prod VPC and its public subnets.
# Dev ECS tasks run in the same VPC as prod (in public subnets, no NAT needed).

data "aws_vpc" "prod" {
  filter {
    name   = "tag:Name"
    values = [var.prod_vpc_name_tag]
  }
}

data "aws_subnets" "public" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.prod.id]
  }
  filter {
    name   = "tag:Name"
    values = ["gousers-prod-public-*"]
  }
}

# Security group: dev ECS tasks (allow traffic from dev ALB only)
resource "aws_security_group" "dev_ecs" {
  name        = "gousers-dev-ecs-sg"
  description = "Allow inbound from dev ALB; outbound anywhere"
  vpc_id      = data.aws_vpc.prod.id

  ingress {
    from_port       = 8000
    to_port         = 8000
    protocol        = "tcp"
    security_groups = [aws_security_group.dev_alb.id]
  }

  ingress {
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.dev_alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "gousers-dev-ecs-sg" }
}
