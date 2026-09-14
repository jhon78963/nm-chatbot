#!/usr/bin/env bash
# check-meta-token.sh — Validate META_WHATSAPP_TOKEN against Graph API (run on VPS).
set -euo pipefail

cd "$(dirname "$0")/.."
set -a
source .env
set +a

if [[ -z "${META_WHATSAPP_TOKEN:-}" ]]; then
  echo "ERROR: META_WHATSAPP_TOKEN is empty in .env" >&2
  exit 1
fi

if [[ -z "${META_WHATSAPP_PHONE_NUMBER_ID:-}" ]]; then
  echo "ERROR: META_WHATSAPP_PHONE_NUMBER_ID is empty in .env" >&2
  exit 1
fi

API_VERSION="${META_API_VERSION:-v20.0}"
BASE="${META_API_BASE_URL:-https://graph.facebook.com}"

echo "==> Token length: ${#META_WHATSAPP_TOKEN} chars"
echo "==> Phone number ID: ${META_WHATSAPP_PHONE_NUMBER_ID}"
echo "==> API: ${BASE}/${API_VERSION}"

HTTP=$(curl -sS -o /tmp/meta_check.json -w "%{http_code}" \
  -H "Authorization: Bearer ${META_WHATSAPP_TOKEN}" \
  "${BASE}/${API_VERSION}/${META_WHATSAPP_PHONE_NUMBER_ID}")

echo "==> GET /{phone-number-id} → HTTP ${HTTP}"

if [[ "$HTTP" == "200" ]]; then
  echo "OK: Token is valid."
  python3 - <<'PY' 2>/dev/null || cat /tmp/meta_check.json
import json
d=json.load(open("/tmp/meta_check.json"))
print("display:", d.get("display_phone_number", d.get("verified_name", "n/a")))
PY
  exit 0
fi

echo "FAIL: Token rejected by Meta."
python3 - <<'PY' 2>/dev/null || cat /tmp/meta_check.json
import json
print(json.dumps(json.load(open("/tmp/meta_check.json")), indent=2))
PY

echo ""
echo "Fix:"
echo "  1. Meta Developers → App → WhatsApp → API Setup → Generate token"
echo "  2. Or create a permanent System User token (recommended for production)"
echo "  3. Update META_WHATSAPP_TOKEN in .env and run: docker compose up -d app"
exit 1
