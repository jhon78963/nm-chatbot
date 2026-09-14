#!/usr/bin/env bash
# setup-admision-apache.sh — admision.uprit.edu.pe vía Apache (producción UPRIT)
set -euo pipefail

REMOTE_DIR="${REMOTE_DIR:-/opt/chatbot-uprit}"
DOMAIN="${ADMISION_DOMAIN:-admision.uprit.edu.pe}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-soporte@uprit.edu.pe}"

cd "${REMOTE_DIR}"

if [[ ! -f admin/dist/index.html ]]; then
  echo "Error: ejecuta npm run build:all primero" >&2
  exit 1
fi

grep -q '^ADMISION_PANEL_URL=' .env || echo "ADMISION_PANEL_URL=https://${DOMAIN}" >> .env
grep -q '^ADMISION_CORS_ORIGIN=' .env || echo "ADMISION_CORS_ORIGIN=https://${DOMAIN}" >> .env

echo "==> Apache vhost admision"
sudo cp deploy/apache/admision.uprit.edu.pe.conf /etc/apache2/sites-available/admision.conf
sudo a2ensite admision.conf 2>/dev/null || sudo a2ensite admision
sudo a2enmod proxy proxy_http rewrite 2>/dev/null || true
sudo apachectl configtest
sudo systemctl reload apache2

echo "==> SSL certbot"
if [[ ! -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]]; then
  sudo certbot --apache \
    -d "${DOMAIN}" \
    --non-interactive \
    --agree-tos \
    -m "${CERTBOT_EMAIL}" \
    --redirect
else
  sudo certbot renew --quiet || true
  sudo systemctl reload apache2
fi

API_PORT="$(grep -E '^API_PORT=' .env | cut -d= -f2- | tr -d '[:space:]' || true)"
API_PORT="${API_PORT:-8090}"

echo "==> Smoke tests"
curl -fsS "http://127.0.0.1:${API_PORT}/health"
echo
curl -fsS -o /dev/null -w "admision HTTPS: %{http_code}\n" "https://${DOMAIN}/" || true

echo "✅ admision Apache listo: https://${DOMAIN}/"
