#!/usr/bin/env bash
# One-time setup: creates S3 bucket for Terraform state and DynamoDB table for state locking.
# Run once before the first `terraform init`.
#
# Usage:
#   export AWS_DEFAULT_REGION=us-east-1
#   export TF_STATE_BUCKET=gousers-terraform-state
#   bash infrastructure/bootstrap.sh

set -euo pipefail

REGION="${AWS_DEFAULT_REGION:-us-east-1}"
BUCKET="${TF_STATE_BUCKET:-gousers-terraform-state}"
TABLE="gousers-terraform-lock"

echo "==> Creating S3 bucket: $BUCKET (region: $REGION)"
if [ "$REGION" = "us-east-1" ]; then
  aws s3api create-bucket --bucket "$BUCKET" --region "$REGION"
else
  aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" \
    --create-bucket-configuration LocationConstraint="$REGION"
fi

aws s3api put-bucket-versioning \
  --bucket "$BUCKET" \
  --versioning-configuration Status=Enabled

aws s3api put-bucket-encryption \
  --bucket "$BUCKET" \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"}
    }]
  }'

aws s3api put-public-access-block \
  --bucket "$BUCKET" \
  --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

echo "==> Creating DynamoDB table: $TABLE"
aws dynamodb create-table \
  --table-name "$TABLE" \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region "$REGION"

echo ""
echo "Bootstrap complete."
echo "Add the following to your GitHub Secrets:"
echo "  TF_STATE_BUCKET=$BUCKET"
echo "  AWS_DEFAULT_REGION=$REGION"
