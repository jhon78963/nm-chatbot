#!/usr/bin/env bash
set -euo pipefail
cd /opt/chatbot-uprit
# Remove empty JWT lines
sed -i '/^JWT_SECRET=$/d' .env
sed -i '/^JWT_SECRET=\s*$/d' .env
if ! grep -q '^JWT_SECRET=.\+' .env; then
  echo "JWT_SECRET=$(openssl rand -base64 48)" >> .env
fi
grep -q '^JWT_EXPIRES_IN=' .env || echo 'JWT_EXPIRES_IN=8h' >> .env
docker compose up -d --force-recreate app
echo jwt_ok
