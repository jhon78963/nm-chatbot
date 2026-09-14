#!/usr/bin/env bash
# audit-meta-secrets.sh — Audit Meta webhook env vars (no secret values printed).
set -euo pipefail

cd "$(dirname "$0")/.."
set -a
source .env
set +a

WS="${WEBHOOK_SECRET:-}"
VT="${META_WEBHOOK_VERIFY_TOKEN:-}"

echo "=== Meta webhook config audit ==="
echo ""
echo "WEBHOOK_SECRET length: ${#WS}"
echo "META_WEBHOOK_VERIFY_TOKEN length: ${#VT}"
echo ""

if [[ -z "$WS" ]]; then
  echo "WEBHOOK_SECRET: EMPTY — must set App Secret from Meta"
elif [[ "$WS" == "$VT" ]]; then
  echo "WEBHOOK_SECRET: SAME as verify token — WRONG (use App Secret instead)"
elif echo "$WS" | grep -qE '^[a-f0-9]{32}$'; then
  echo "WEBHOOK_SECRET format: OK (32 hex, typical App Secret)"
else
  echo "WEBHOOK_SECRET format: UNUSUAL (App Secret is usually 32 hex characters)"
fi

echo ""
echo "META_WEBHOOK_VERIFY_TOKEN: custom string you choose for Meta webhook setup"
echo "WEBHOOK_SECRET: must be Meta App Secret (Configuracion > Basica > Clave secreta)"
echo ""

FILE_WS=$(grep -E '^WEBHOOK_SECRET=' .env | cut -d= -f2- | wc -c | tr -d ' ')
CONT_WS=$(docker compose exec -T app printenv WEBHOOK_SECRET 2>/dev/null | wc -c | tr -d ' ' || echo 0)

if [[ "$FILE_WS" == "$CONT_WS" ]]; then
  echo "Container sync: OK (.env loaded in running app)"
else
  echo "Container sync: MISMATCH — run: docker compose up -d app"
fi
