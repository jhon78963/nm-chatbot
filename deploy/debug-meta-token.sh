#!/usr/bin/env bash
# debug-meta-token.sh — Show token expiry without printing the full token.
set -euo pipefail

cd "$(dirname "$0")/.."
set -a
source .env
set +a

echo "==> META_WHATSAPP_TOKEN length: ${#META_WHATSAPP_TOKEN}"
echo "==> META_WHATSAPP_PHONE_NUMBER_ID: ${META_WHATSAPP_PHONE_NUMBER_ID:-empty}"

curl -sS -o /tmp/token_debug.json \
  "https://graph.facebook.com/debug_token?input_token=${META_WHATSAPP_TOKEN}&access_token=${META_WHATSAPP_TOKEN}"

python3 <<'PY'
import json
from datetime import datetime, timezone

d = json.load(open("/tmp/token_debug.json"))
data = d.get("data") or {}
err = d.get("error")

if err:
    print("debug_token error:", err.get("message", err))
else:
    exp = data.get("expires_at", 0)
    valid = data.get("is_valid", False)
    app_id = data.get("app_id", "?")
    if exp == 0:
        exp_str = "never (permanent token)"
    else:
        exp_str = datetime.fromtimestamp(exp, tz=timezone.utc).isoformat()
    print(f"is_valid: {valid}")
    print(f"app_id: {app_id}")
    print(f"expires_at: {exp_str}")
    scopes = data.get("scopes") or []
    if scopes:
        print("scopes:", ", ".join(scopes[:8]))
PY

bash deploy/check-meta-token.sh 2>/dev/null | tail -3
