resource "aws_security_group" "ollama" {
  name        = "${local.prefix}-ollama-sg"
  description = "Allow Ollama API from ECS tasks"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 11434
    to_port         = 11434
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  # Allow SSH for emergency access (restrict source CIDR in production)
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "SSH - restrict to your IP in production"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${local.prefix}-ollama-sg" }
}

resource "aws_instance" "ollama" {
  ami                    = var.ollama_ami
  instance_type          = var.ollama_instance_type
  subnet_id              = aws_subnet.public[0].id
  vpc_security_group_ids = [aws_security_group.ollama.id]

  root_block_device {
    volume_size = 40 # GB — llama3.2 ~2GB + OS headroom
    volume_type = "gp3"
    encrypted   = true
  }

  user_data = <<-EOF
    #!/bin/bash
    set -ex

    # Install Ollama
    curl -fsSL https://ollama.ai/install.sh | sh

    # Start Ollama service and enable on boot
    systemctl enable ollama
    systemctl start ollama

    # Wait for service to be ready, then pull model
    sleep 10
    ollama pull ${var.ollama_model}
  EOF

  tags = { Name = "${local.prefix}-ollama" }
}
