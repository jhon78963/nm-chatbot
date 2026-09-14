#!/usr/bin/env bash
# Genera el environment de Postman desde .env local (no commitear el output).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="${ROOT}/.env"
OUT="${ROOT}/deploy/postman/chatbot-uprit.postman_environment.json"

get_env() {
  grep -E "^${1}=" "$ENV_FILE" | tail -1 | cut -d= -f2-
}

cat > "$OUT" <<EOF
{
  "id": "chatbot-uprit-env",
  "name": "Chatbot UPRIT — Production",
  "values": [
    { "key": "base_url", "value": "https://chatbot.uprit.edu.pe", "type": "default", "enabled": true },
    { "key": "webhook_verify_token", "value": "$(get_env META_WEBHOOK_VERIFY_TOKEN)", "type": "secret", "enabled": true },
    { "key": "webhook_secret", "value": "$(get_env WEBHOOK_SECRET)", "type": "secret", "enabled": true },
    { "key": "meta_token", "value": "$(get_env META_WHATSAPP_TOKEN)", "type": "secret", "enabled": true },
    { "key": "phone_number_id", "value": "$(get_env META_WHATSAPP_PHONE_NUMBER_ID)", "type": "default", "enabled": true },
    { "key": "meta_api_version", "value": "$(get_env META_API_VERSION)", "type": "default", "enabled": true },
    { "key": "test_wa_id", "value": "51999888777", "type": "default", "enabled": true },
    { "key": "test_message", "value": "Hola, quiero información sobre Ingeniería Civil", "type": "default", "enabled": true }
  ],
  "_postman_variable_scope": "environment"
}
EOF

echo "Generated: $OUT"
echo "Re-importa este archivo en Postman (Environments → Import)."
