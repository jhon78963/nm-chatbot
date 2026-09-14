#!/usr/bin/env bash
#
# bootstrap-ec2.sh — First-time server setup for chatbot.uprit.edu.pe
# Run once from your local machine:
#   ./deploy/bootstrap-ec2.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
VPS_DIR="${REPO_ROOT}/vps"
# shellcheck source=ec2-profile.sh
source "${SCRIPT_DIR}/ec2-profile.sh"
ec2_profile_resolve "${VPS_DIR}"
ec2_profile_ssh_opts
REPO_URL="${REPO_URL:-https://github.com/jhon-livias/chatbot.git}"

echo "==> Bootstrapping (${VPS_PROFILE}) ${SSH_USER}@${EC2_HOST}"

ssh "${SSH_OPTS[@]}" "${SSH_USER}@${EC2_HOST}" bash -s <<'REMOTE'
set -euo pipefail

sudo apt-get update
sudo apt-get install -y ca-certificates curl git nginx certbot python3-certbot-nginx

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
fi

if ! docker compose version >/dev/null 2>&1; then
  sudo apt-get install -y docker-compose-plugin
fi
REMOTE

ssh "${SSH_OPTS[@]}" "${SSH_USER}@${EC2_HOST}" bash -s <<EOF
set -euo pipefail

if [[ ! -d "${REMOTE_DIR}/.git" ]]; then
  sudo mkdir -p "${REMOTE_DIR}"
  sudo chown "\$USER:\$USER" "${REMOTE_DIR}"
  git clone "${REPO_URL}" "${REMOTE_DIR}"
fi

cd "${REMOTE_DIR}"

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Created ${REMOTE_DIR}/.env from .env.example — edit production values before going live."
fi

docker compose build app
docker compose up -d app

sudo cp deploy/nginx/chatbot.uprit.edu.pe.conf /etc/nginx/sites-available/chatbot.uprit.edu.pe.conf
sudo ln -sf /etc/nginx/sites-available/chatbot.uprit.edu.pe.conf /etc/nginx/sites-enabled/chatbot.uprit.edu.pe.conf
sudo rm -f /etc/nginx/sites-enabled/default

if [[ ! -f /etc/letsencrypt/live/chatbot.uprit.edu.pe/fullchain.pem ]]; then
  echo "Run certbot once DNS points to this server:"
  echo "  sudo certbot --nginx -d chatbot.uprit.edu.pe"
else
  sudo nginx -t
  sudo systemctl reload nginx
fi
EOF

echo "==> Bootstrap finished. Next:"
echo "  1. Point DNS chatbot.uprit.edu.pe -> EC2 public IP"
echo "  2. Edit ${REMOTE_DIR}/.env on the server (META_*, WEBHOOK_SECRET=Meta App Secret, MONGODB_URI)"
echo "  3. sudo certbot --nginx -d chatbot.uprit.edu.pe"
echo "  4. ./deploy/deploy-ec2.sh for future releases"
