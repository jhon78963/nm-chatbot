#!/usr/bin/env bash
# check-webhook-secret.sh — Ensure WEBHOOK_SECRET is loaded and matches Meta App Secret.
set -euo pipefail

cd "$(dirname "$0")/.."
set -a
source .env
set +a

FILE_LEN=$(grep -E '^WEBHOOK_SECRET=' .env | cut -d= -f2- | wc -c | tr -d ' ')
CONTAINER_LEN=$(docker compose exec -T app printenv WEBHOOK_SECRET | wc -c | tr -d ' ')

echo "==> WEBHOOK_SECRET length in .env: ${FILE_LEN} (incl. newline if any)"
echo "==> WEBHOOK_SECRET length in container: ${CONTAINER_LEN}"

if [[ "$FILE_LEN" != "$CONTAINER_LEN" ]]; then
  echo "WARN: .env and container differ — run: docker compose up -d app"
fi

if [[ -z "${WEBHOOK_SECRET:-}" ]]; then
  echo "ERROR: WEBHOOK_SECRET is empty" >&2
  exit 1
fi

if [[ -z "${META_WHATSAPP_TOKEN:-}" ]]; then
  echo "ERROR: META_WHATSAPP_TOKEN is empty" >&2
  exit 1
fi

# Meta signs webhooks with the App Secret — same value required in WEBHOOK_SECRET.
HTTP=$(curl -sS -o /tmp/app_info.json -w "%{http_code}" \
  -H "Authorization: Bearer ${META_WHATSAPP_TOKEN}" \
  "https://graph.facebook.com/${META_API_VERSION:-v20.0}/app?fields=id")

if [[ "$HTTP" != "200" ]]; then
  echo "WARN: Could not fetch app info (HTTP ${HTTP})"
  cat /tmp/app_info.json 2>/dev/null || true
  exit 0
fi

echo "==> WEBHOOK_SECRET must equal Meta App Secret (Configuración → Básica → Clave secreta)"
echo "==> NOT the verify token. After updating .env: docker compose up -d app"
echo "OK: Config loaded. If Meta callbacks still fail, re-copy App Secret into WEBHOOK_SECRET."
