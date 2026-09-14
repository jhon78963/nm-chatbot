#!/usr/bin/env bash
# inspect-env.sh — Show .env metadata without printing secret values.
set -euo pipefail
cd /opt/chatbot-uprit
echo "=== .env file ==="
ls -la .env
echo "=== git tracks .env? ==="
git ls-files --error-unmatch .env 2>&1 || echo "not tracked (good)"
git check-ignore -v .env || true
echo "=== variable lengths ==="
set -a; source .env; set +a
echo "META_WHATSAPP_TOKEN: ${#META_WHATSAPP_TOKEN} chars"
echo "WEBHOOK_SECRET: ${#WEBHOOK_SECRET} chars"
echo "META_WEBHOOK_VERIFY_TOKEN: ${#META_WEBHOOK_VERIFY_TOKEN} chars"
echo "META_WHATSAPP_PHONE_NUMBER_ID: ${META_WHATSAPP_PHONE_NUMBER_ID:-empty}"
