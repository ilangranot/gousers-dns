#!/bin/bash
# Seed the OpenAI API key into the dev org via the superadmin endpoint.
# Requires a valid staff JWT — get it from the browser console:
#   copy(await window.Clerk.session.getToken({ template: "gousers" }))
#
# Usage:
#   STAFF_TOKEN=<paste_token> bash scripts/seed_dev_openai.sh

set -e

API_URL="https://api.dev.gousers.com"
ORG_ID="org_3A3E1wtdNlixAUI0ljYPparHtgd"  # My Organization

if [ -z "$STAFF_TOKEN" ]; then
  echo "ERROR: set STAFF_TOKEN env var (get from browser Clerk console)"
  echo "  copy(await window.Clerk.session.getToken({ template: 'gousers' }))"
  exit 1
fi

OPENAI_KEY=$(aws secretsmanager get-secret-value \
  --secret-id gousers-dev/openai-ref \
  --query SecretString --output text)

echo "Seeding OpenAI connection for org $ORG_ID ..."
curl -sf -X POST "$API_URL/superadmin/orgs/$ORG_ID/connections" \
  -H "Authorization: Bearer $STAFF_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"provider\": \"openai\", \"api_key\": \"$OPENAI_KEY\", \"model\": \"gpt-4o\"}"
echo ""
echo "Done. ChatGPT connection is now active."
