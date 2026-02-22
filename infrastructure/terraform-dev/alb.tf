resource "aws_security_group" "dev_alb" {
  name        = "gousers-dev-alb-sg"
  description = "Allow HTTP/HTTPS from anywhere to dev ALB"
  vpc_id      = data.aws_vpc.prod.id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "gousers-dev-alb-sg" }
}

resource "aws_lb" "dev" {
  name               = "gousers-dev-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.dev_alb.id]
  subnets            = data.aws_subnets.public.ids
}

# ── Target groups ──────────────────────────────────────────────────────────────
resource "aws_lb_target_group" "dev_api" {
  name        = "gousers-dev-api-tg"
  port        = 8000
  protocol    = "HTTP"
  vpc_id      = data.aws_vpc.prod.id
  target_type = "ip"

  health_check {
    path                = "/health"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 30
    timeout             = 10
  }
}

resource "aws_lb_target_group" "dev_web" {
  name        = "gousers-dev-web-tg"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = data.aws_vpc.prod.id
  target_type = "ip"

  health_check {
    path                = "/"
    matcher             = "200-399"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 30
    timeout             = 10
  }
}

# ── HTTP → HTTPS redirect ──────────────────────────────────────────────────────
resource "aws_lb_listener" "dev_http" {
  load_balancer_arn = aws_lb.dev.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

# ── HTTPS listener ─────────────────────────────────────────────────────────────
resource "aws_lb_listener" "dev_https" {
  load_balancer_arn = aws_lb.dev.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate_validation.dev.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.dev_web.arn
  }
}

resource "aws_lb_listener_rule" "dev_api" {
  listener_arn = aws_lb_listener.dev_https.arn
  priority     = 10

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.dev_api.arn
  }

  condition {
    host_header {
      values = [local.api_domain]
    }
  }
}
