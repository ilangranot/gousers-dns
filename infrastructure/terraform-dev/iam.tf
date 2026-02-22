data "aws_iam_policy_document" "dev_ecs_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# ── ECS Task Execution Role ────────────────────────────────────────────────────
resource "aws_iam_role" "dev_ecs_task_execution" {
  name               = "gousers-dev-ecs-task-execution"
  assume_role_policy = data.aws_iam_policy_document.dev_ecs_assume_role.json
}

resource "aws_iam_role_policy_attachment" "dev_ecs_task_execution_managed" {
  role       = aws_iam_role.dev_ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy_document" "dev_ecs_secrets_access" {
  statement {
    effect    = "Allow"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.dev_app.arn]
  }
}

resource "aws_iam_role_policy" "dev_ecs_secrets_access" {
  name   = "gousers-dev-ecs-secrets-access"
  role   = aws_iam_role.dev_ecs_task_execution.id
  policy = data.aws_iam_policy_document.dev_ecs_secrets_access.json
}

# ── ECS Task Role (runtime permissions) ───────────────────────────────────────
resource "aws_iam_role" "dev_ecs_task" {
  name               = "gousers-dev-ecs-task"
  assume_role_policy = data.aws_iam_policy_document.dev_ecs_assume_role.json
}

data "aws_iam_policy_document" "dev_ecs_task_logs" {
  statement {
    effect = "Allow"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["arn:aws:logs:*:*:*"]
  }
}

resource "aws_iam_role_policy" "dev_ecs_task_logs" {
  name   = "gousers-dev-ecs-task-logs"
  role   = aws_iam_role.dev_ecs_task.id
  policy = data.aws_iam_policy_document.dev_ecs_task_logs.json
}
