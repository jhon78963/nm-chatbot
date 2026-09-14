#!/usr/bin/env bash
# subscribe-meta-waba.sh — Suscribe la app de Meta al WABA de producción (requerido para recibir webhooks).
set -euo pipefail

cd "$(dirname "$0")/.."

WABA_ID="${META_WHATSAPP_BUSINESS_ACCOUNT_ID:-}"
TOKEN="${META_WHATSAPP_TOKEN:-}"
API_VERSION="${META_API_VERSION:-v20.0}"
BASE="${META_API_BASE_URL:-https://graph.facebook.com}"

if [[ -z "$WABA_ID" || -z "$TOKEN" ]]; then
  echo "ERROR: META_WHATSAPP_BUSINESS_ACCOUNT_ID y META_WHATSAPP_TOKEN son requeridos en .env" >&2
  exit 1
fi

echo "==> Suscribiendo app al WABA ${WABA_ID}..."
HTTP=$(curl -sS -o /tmp/meta_subscribe.json -w "%{http_code}" -X POST \
  -H "Authorization: Bearer ${TOKEN}" \
  "${BASE}/${API_VERSION}/${WABA_ID}/subscribed_apps")

if [[ "$HTTP" != "200" ]]; then
  echo "FAIL: POST /subscribed_apps → HTTP ${HTTP}" >&2
  cat /tmp/meta_subscribe.json >&2
  exit 1
fi

echo "==> Verificando suscripción..."
curl -sS -H "Authorization: Bearer ${TOKEN}" \
  "${BASE}/${API_VERSION}/${WABA_ID}/subscribed_apps" | python3 -m json.tool 2>/dev/null || cat /tmp/meta_subscribe.json

echo "OK: App suscrita al WABA."
