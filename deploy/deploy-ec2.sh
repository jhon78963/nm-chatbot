#!/usr/bin/env bash
#
# deploy-ec2.sh — Pull latest code and restart the chatbot on EC2.
# Run from your local machine:
#   ./deploy/deploy-ec2.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
VPS_DIR="${REPO_ROOT}/vps"
# shellcheck source=ec2-profile.sh
source "${SCRIPT_DIR}/ec2-profile.sh"
ec2_profile_resolve "${VPS_DIR}"
ec2_profile_ssh_opts

echo "==> Deploying (${VPS_PROFILE}) to ${SSH_USER}@${EC2_HOST}:${REMOTE_DIR}"

ssh "${SSH_OPTS[@]}" "${SSH_USER}@${EC2_HOST}" bash -s <<EOF
set -euo pipefail
cd "${REMOTE_DIR}"

if [[ ! -f .env ]]; then
  echo "Error: ${REMOTE_DIR}/.env not found. Create it before deploying." >&2
  exit 1
fi

echo "==> git pull"
git pull --ff-only origin main

echo "==> npm install + build:all"
npm ci --include=dev --ignore-scripts
(cd admin && npm ci --include=dev --ignore-scripts)
export PATH="\${PWD}/node_modules/.bin:\${PWD}/admin/node_modules/.bin:\${PATH}"
npm run build:all

echo "==> docker compose build app"
docker compose build app

echo "==> docker compose up -d app"
docker compose up -d app

echo "==> web proxy config"
if command -v apache2 >/dev/null 2>&1 && systemctl is-active --quiet apache2 2>/dev/null; then
  sudo cp deploy/apache/admision.uprit.edu.pe.conf /etc/apache2/sites-available/admision.conf
  if [[ -f deploy/apache/admision-le-ssl.conf ]]; then
    sudo cp deploy/apache/admision-le-ssl.conf /etc/apache2/sites-available/admision-le-ssl.conf
  fi
  sudo a2enmod proxy_wstunnel 2>/dev/null || true
  sudo apachectl configtest
  sudo systemctl reload apache2
elif command -v nginx >/dev/null 2>&1; then
  sudo cp deploy/nginx/admision.uprit.edu.pe.conf /etc/nginx/sites-available/
  sudo cp deploy/nginx/chatbot.uprit.edu.pe.conf /etc/nginx/sites-available/chatbot.uprit.edu.pe.conf
  API_PORT="\$(grep -E '^API_PORT=' .env | cut -d= -f2- | tr -d '[:space:]' || true)"
  API_PORT="\${API_PORT:-8090}"
  if [[ "\${API_PORT}" != "8090" ]]; then
    sudo sed -i "s/127.0.0.1:8090/127.0.0.1:\${API_PORT}/g" /etc/nginx/sites-available/admision.uprit.edu.pe.conf
    sudo sed -i "s/127.0.0.1:8090/127.0.0.1:\${API_PORT}/g" /etc/nginx/sites-available/chatbot.uprit.edu.pe.conf
  fi
  sudo nginx -t
  sudo systemctl reload nginx
fi

echo "==> health check"
sleep 3
API_PORT="\$(grep -E '^API_PORT=' .env | cut -d= -f2- | tr -d '[:space:]' || true)"
API_PORT="\${API_PORT:-8090}"
curl -fsS "http://127.0.0.1:\${API_PORT}/health"
echo
docker compose ps app
EOF

echo "==> Deploy finished"
