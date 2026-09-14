#!/usr/bin/env bash
#
# remote-setup.sh — Full server bootstrap for chatbot.uprit.edu.pe
#
# Run ON the EC2 instance (EC2 Instance Connect browser terminal):
#   curl -fsSL https://raw.githubusercontent.com/jhon-livias/chatbot/main/deploy/remote-setup.sh | bash
#
set -euo pipefail

DOMAIN="${DOMAIN:-chatbot.uprit.edu.pe}"
REPO_URL="${REPO_URL:-https://github.com/jhon-livias/chatbot.git}"
REMOTE_DIR="${REMOTE_DIR:-/opt/chatbot-uprit}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-soporte@uprit.edu.pe}"
REPO_BRANCH="${REPO_BRANCH:-main}"

echo "==> [1/8] System packages"
export DEBIAN_FRONTEND=noninteractive
sudo apt-get update -qq
sudo apt-get install -y -qq ca-certificates curl git nginx certbot python3-certbot-nginx docker-compose-plugin

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sudo sh
fi
sudo usermod -aG docker "$USER" 2>/dev/null || true

echo "==> [2/8] Clone or update repository"
if [[ ! -d "${REMOTE_DIR}/.git" ]]; then
  sudo mkdir -p "${REMOTE_DIR}"
  sudo chown "$USER:$USER" "${REMOTE_DIR}"
  git clone "${REPO_URL}" "${REMOTE_DIR}"
fi
cd "${REMOTE_DIR}"
git fetch origin "${REPO_BRANCH}"
git reset --hard "origin/${REPO_BRANCH}"

echo "==> [3/8] Environment file"
if [[ -n "${PRODUCTION_ENV:-}" ]]; then
  printf '%s\n' "${PRODUCTION_ENV}" > .env
elif [[ ! -f .env ]]; then
  cp .env.example .env
  echo "WARNING: Created .env from example. Edit ${REMOTE_DIR}/.env before production traffic."
fi

# Ensure production runtime defaults
grep -q '^NODE_ENV=' .env || echo 'NODE_ENV=production' >> .env
grep -q '^API_PORT=' .env || echo 'API_PORT=8080' >> .env
sed -i 's/^NODE_ENV=.*/NODE_ENV=production/' .env

echo "==> [4/8] Docker app"
docker compose build app
docker compose up -d app

echo "==> [5/8] Nginx HTTP config"
sudo cp deploy/nginx/chatbot.uprit.edu.pe.conf /etc/nginx/sites-available/chatbot.uprit.edu.pe.conf
sudo ln -sf /etc/nginx/sites-available/chatbot.uprit.edu.pe.conf /etc/nginx/sites-enabled/chatbot.uprit.edu.pe.conf
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl restart nginx

echo "==> [6/8] Local health check"
sleep 4
curl -fsS http://127.0.0.1:8080/health
echo
curl -fsS -H "Host: ${DOMAIN}" http://127.0.0.1/health
echo

echo "==> [7/8] SSL with Let's Encrypt"
if [[ ! -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]]; then
  sudo certbot --nginx \
    -d "${DOMAIN}" \
    --non-interactive \
    --agree-tos \
    -m "${CERTBOT_EMAIL}" \
    --redirect
else
  sudo certbot renew --quiet || true
  sudo systemctl reload nginx
fi

echo "==> [8/8] Final checks"
curl -fsS http://127.0.0.1:8080/health
echo
docker compose ps app
sudo nginx -t

echo
echo "Setup complete."
echo "Cloudflare SSL/TLS mode should be: Full (strict) after certbot."
echo "Meta webhook URL: https://${DOMAIN}/webhook"
echo "Verify with:"
echo "  curl \"https://${DOMAIN}/webhook?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=test123\""
