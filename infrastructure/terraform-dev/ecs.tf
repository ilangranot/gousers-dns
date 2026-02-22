data "aws_caller_identity" "dev_current" {}

data "aws_ecr_repository" "api" {
  name = "gousers-api"
}

data "aws_ecr_repository" "web" {
  name = "gousers-web"
}

locals {
  dev_account_id = data.aws_caller_identity.dev_current.account_id

  # Dev secrets — same keys as prod minus OLLAMA_URL (no Ollama in dev)
  dev_ecs_secrets = [
    for key in [
      "DATABASE_URL", "REDIS_URL", "CLERK_SECRET_KEY", "CLERK_WEBHOOK_SECRET",
      "ENCRYPTION_KEY", "APP_ENV", "CORS_ORIGINS"
    ] : {
      name      = key
      valueFrom = "${aws_secretsmanager_secret.dev_app.arn}:${key}::"
    }
  ]
}

# ── ECS Cluster ────────────────────────────────────────────────────────────────
resource "aws_ecs_cluster" "dev" {
  name = "gousers-dev"

  setting {
    name  = "containerInsights"
    value = "disabled"  # Save cost in dev
  }
}

# ── CloudWatch Log Groups ──────────────────────────────────────────────────────
resource "aws_cloudwatch_log_group" "dev_api" {
  name              = "/ecs/gousers-dev/api"
  retention_in_days = 7
}

resource "aws_cloudwatch_log_group" "dev_worker" {
  name              = "/ecs/gousers-dev/worker"
  retention_in_days = 7
}

resource "aws_cloudwatch_log_group" "dev_web" {
  name              = "/ecs/gousers-dev/web"
  retention_in_days = 7
}

# ── API Task Definition ────────────────────────────────────────────────────────
resource "aws_ecs_task_definition" "dev_api" {
  family                   = "gousers-dev-api"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.dev_ecs_task_execution.arn
  task_role_arn            = aws_iam_role.dev_ecs_task.arn

  container_definitions = jsonencode([{
    name      = "api"
    image     = "${data.aws_ecr_repository.api.repository_url}:dev"
    essential = true

    portMappings = [{ containerPort = 8000 }]
    secrets      = local.dev_ecs_secrets

    healthCheck = {
      command     = ["CMD-SHELL", "curl -f http://localhost:8000/health || exit 1"]
      interval    = 30
      timeout     = 10
      retries     = 3
      startPeriod = 60
    }

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.dev_api.name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "ecs"
      }
    }
  }])
}

# ── Worker Task Definition ─────────────────────────────────────────────────────
resource "aws_ecs_task_definition" "dev_worker" {
  family                   = "gousers-dev-worker"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.dev_ecs_task_execution.arn
  task_role_arn            = aws_iam_role.dev_ecs_task.arn

  container_definitions = jsonencode([{
    name      = "worker"
    image     = "${data.aws_ecr_repository.api.repository_url}:dev"
    essential = true
    command   = ["celery", "-A", "app.workers.celery_app", "worker", "--loglevel=info"]
    secrets   = local.dev_ecs_secrets

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.dev_worker.name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "ecs"
      }
    }
  }])
}

# ── Web Task Definition ────────────────────────────────────────────────────────
resource "aws_ecs_task_definition" "dev_web" {
  family                   = "gousers-dev-web"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.dev_ecs_task_execution.arn
  task_role_arn            = aws_iam_role.dev_ecs_task.arn

  container_definitions = jsonencode([{
    name      = "web"
    image     = "${data.aws_ecr_repository.web.repository_url}:dev"
    essential = true

    portMappings = [{ containerPort = 3000 }]

    secrets = [{
      name      = "CLERK_SECRET_KEY"
      valueFrom = "${aws_secretsmanager_secret.dev_app.arn}:CLERK_SECRET_KEY::"
    }]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.dev_web.name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "ecs"
      }
    }
  }])
}

# ── ECS Services ───────────────────────────────────────────────────────────────
resource "aws_ecs_service" "dev_api" {
  name            = "gousers-api"
  cluster         = aws_ecs_cluster.dev.id
  task_definition = aws_ecs_task_definition.dev_api.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = data.aws_subnets.public.ids
    security_groups  = [aws_security_group.dev_ecs.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.dev_api.arn
    container_name   = "api"
    container_port   = 8000
  }

  depends_on = [aws_lb_listener.dev_https]
}

resource "aws_ecs_service" "dev_worker" {
  name            = "gousers-worker"
  cluster         = aws_ecs_cluster.dev.id
  task_definition = aws_ecs_task_definition.dev_worker.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = data.aws_subnets.public.ids
    security_groups  = [aws_security_group.dev_ecs.id]
    assign_public_ip = true
  }
}

resource "aws_ecs_service" "dev_web" {
  name            = "gousers-web"
  cluster         = aws_ecs_cluster.dev.id
  task_definition = aws_ecs_task_definition.dev_web.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = data.aws_subnets.public.ids
    security_groups  = [aws_security_group.dev_ecs.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.dev_web.arn
    container_name   = "web"
    container_port   = 3000
  }

  depends_on = [aws_lb_listener.dev_https]
}
