#!/usr/bin/env bash
# generate-postman-env.sh — Build Postman environment JSON from .env (run on VPS).
# Usage (local): ./vps/connect.sh "bash /opt/chatbot-uprit/deploy/generate-postman-env.sh" > postman/chatbot-uprit.postman_environment.local.json
set -euo pipefail

cd "$(dirname "$0")/.."
set -a
source .env
set +a

python3 <<'PY'
import json
import os

env = {
    "id": "d4e5f6a7-b8c9-0123-def4-567890abcdef",
    "name": "Chatbot UPRIT — Production (synced)",
    "values": [
        {
            "key": "meta_webhook_verify_token",
            "value": os.environ.get("META_WEBHOOK_VERIFY_TOKEN", ""),
            "type": "secret",
            "enabled": True,
        },
        {
            "key": "webhook_secret",
            "value": os.environ.get("WEBHOOK_SECRET", ""),
            "type": "secret",
            "enabled": True,
        },
        {
            "key": "webhook_challenge",
            "value": "test123",
            "type": "default",
            "enabled": True,
        },
        {
            "key": "test_wa_id",
            "value": "51925762767",
            "type": "default",
            "enabled": True,
        },
        {
            "key": "test_message",
            "value": "Hola, quiero información sobre admisión",
            "type": "default",
            "enabled": True,
        },
    ],
    "_postman_variable_scope": "environment",
    "_postman_exported_at": "2026-07-02T17:45:00.000Z",
    "_postman_exported_using": "chatbot-uprit/deploy/generate-postman-env.sh",
}

print(json.dumps(env, indent=2, ensure_ascii=False))
PY
