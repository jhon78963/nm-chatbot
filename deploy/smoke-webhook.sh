#!/usr/bin/env bash
# smoke-webhook.sh — POST a signed test message to the local app (run on VPS).
set -euo pipefail

cd "$(dirname "$0")/.."
set -a
source .env
set +a

WA_ID="${1:-51925762767}"
MSG="${2:-test deploy fix}"

BODY=$(cat <<EOF
{"object":"whatsapp_business_account","entry":[{"id":"TEST","changes":[{"field":"messages","value":{"messaging_product":"whatsapp","metadata":{"phone_number_id":"123"},"contacts":[{"profile":{"name":"Smoke Test"},"wa_id":"${WA_ID}"}],"messages":[{"from":"${WA_ID}","id":"wamid.smoke.$(date +%s)","timestamp":"1719900000","type":"text","text":{"body":"${MSG}"}}]}}]}]}
EOF
)

SIG="sha256=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" | awk '{print $2}')"
API_PORT="$(grep -E '^API_PORT=' .env | cut -d= -f2- | tr -d '[:space:]' || true)"
API_PORT="${API_PORT:-8090}"

echo "==> POST /webhook (wa_id=${WA_ID})"
curl -fsS -X POST "http://127.0.0.1:${API_PORT}/webhook" \
  -H "Content-Type: application/json" \
  -H "x-hub-signature-256: ${SIG}" \
  -d "$BODY"
echo

sleep 8
echo "==> Recent app logs"
docker compose logs --tail=25 app | grep -iE 'Meta|WhatsApp|error|sent|processed' || true
