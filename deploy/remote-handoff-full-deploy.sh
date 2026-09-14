#!/usr/bin/env bash
# remote-handoff-full-deploy.sh — Deploy completo handoff + admision (ejecutar en VPS)
set -euo pipefail

cd /opt/chatbot-uprit

echo "==> [1/9] git pull"
git pull --ff-only origin main

echo "==> [2/9] .env handoff vars"
grep -q '^JWT_SECRET=' .env || echo "JWT_SECRET=$(openssl rand -base64 48)" >> .env
grep -q '^JWT_EXPIRES_IN=' .env || echo 'JWT_EXPIRES_IN=8h' >> .env
grep -q '^ADMISION_PANEL_URL=' .env || echo 'ADMISION_PANEL_URL=https://admision.uprit.edu.pe' >> .env
grep -q '^ADMISION_CORS_ORIGIN=' .env || echo 'ADMISION_CORS_ORIGIN=https://admision.uprit.edu.pe' >> .env
grep -q '^HANDOFF_TRANSITION_MESSAGE=' .env || echo 'HANDOFF_TRANSITION_MESSAGE=Te comunico con {agentName}, asesor de admisiones de la UPRIT. En un momento te atiende.' >> .env

echo "==> [3/9] npm install"
npm ci --ignore-scripts
(cd admin && npm ci --ignore-scripts)

echo "==> [4/9] build:all"
npm run build:all

echo "==> [5/9] docker rebuild"
docker compose build app
docker compose up -d app

echo "==> [6/9] migrate handoff fields"
node --env-file=.env deploy/migrate-conversation-handoff-fields.mjs || true

echo "==> [7/9] setup admision nginx + SSL"
bash deploy/setup-admision-domain.sh

echo "==> [8/9] update chatbot nginx (block /api on chatbot domain)"
sudo cp deploy/nginx/chatbot.uprit.edu.pe.conf /etc/nginx/sites-available/chatbot.uprit.edu.pe.conf
API_PORT="$(grep -E '^API_PORT=' .env | cut -d= -f2- | tr -d '[:space:]' || true)"
API_PORT="${API_PORT:-8090}"
if [[ "${API_PORT}" != "8090" ]]; then
  sudo sed -i "s/127.0.0.1:8090/127.0.0.1:${API_PORT}/g" /etc/nginx/sites-available/chatbot.uprit.edu.pe.conf
fi
sudo nginx -t && sudo systemctl reload nginx

echo "==> [9/9] seed agent passwords"
node --env-file=.env deploy/seed-agent-passwords.mjs

echo "==> health checks"
sleep 3
curl -fsS "http://127.0.0.1:${API_PORT}/health"
echo
curl -fsS "https://chatbot.uprit.edu.pe/health" || true
echo
curl -fsS -o /dev/null -w "admision: %{http_code}\n" "https://admision.uprit.edu.pe/" || true

docker compose ps app
echo "==> DEPLOY COMPLETE"
