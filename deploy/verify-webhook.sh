#!/usr/bin/env bash
# verify-webhook.sh — Test Meta webhook GET verification (run on VPS or locally).
set -euo pipefail

cd "$(dirname "$0")/.."
set -a
source .env
set +a

CHALLENGE="${1:-test123}"
URL="https://chatbot.uprit.edu.pe/webhook?hub.mode=subscribe&hub.verify_token=${META_WEBHOOK_VERIFY_TOKEN}&hub.challenge=${CHALLENGE}"

echo "==> GET verify"
BODY=$(curl -fsS "$URL")
echo "status=200 body=${BODY}"

if [[ "$BODY" != "$CHALLENGE" ]]; then
  echo "ERROR: expected challenge ${CHALLENGE}" >&2
  exit 1
fi

echo "==> OK"
