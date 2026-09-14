#!/usr/bin/env bash
#
# setup-admision-domain.sh — Configura admision.uprit.edu.pe en el VPS
#
# Ejecutar EN EL SERVIDOR desde /opt/chatbot-uprit:
#   bash deploy/setup-admision-domain.sh
#
# Requisitos:
#   - DNS A admision.uprit.edu.pe → IP del VPS (misma que chatbot.uprit.edu.pe)
#   - Backend Docker corriendo (API_PORT=8090 en .env)
#   - nginx + certbot instalados (remote-setup.sh ya los instala)
#
set -euo pipefail

REMOTE_DIR="${REMOTE_DIR:-/opt/chatbot-uprit}"
DOMAIN="${ADMISION_DOMAIN:-admision.uprit.edu.pe}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-soporte@uprit.edu.pe}"
API_PORT="${API_PORT:-8090}"

cd "${REMOTE_DIR}"

echo "==> [1/6] Verificar .env"
if [[ ! -f .env ]]; then
  echo "Error: .env no encontrado en ${REMOTE_DIR}" >&2
  exit 1
fi

# Asegurar variables de producción para handoff (sin commitear secrets)
grep -q '^ADMISION_PANEL_URL=' .env || echo "ADMISION_PANEL_URL=https://${DOMAIN}" >> .env
grep -q '^ADMISION_CORS_ORIGIN=' .env || echo "ADMISION_CORS_ORIGIN=https://${DOMAIN}" >> .env
grep -q '^JWT_SECRET=' .env || echo "WARNING: JWT_SECRET no está en .env — agrégalo antes de producción" >&2

API_PORT="$(grep -E '^API_PORT=' .env | cut -d= -f2- | tr -d '[:space:]' || true)"
API_PORT="${API_PORT:-8090}"

echo "==> [2/6] Build backend + admin panel"
npm run build:all

if [[ ! -f admin/dist/index.html ]]; then
  echo "Error: admin/dist/index.html no existe tras build:all" >&2
  exit 1
fi

echo "==> [3/6] Instalar config Nginx admision"
sudo cp deploy/nginx/admision.uprit.edu.pe.conf /etc/nginx/sites-available/admision.uprit.edu.pe.conf

# Ajustar puerto API si difiere de 8090
if [[ "${API_PORT}" != "8090" ]]; then
  sudo sed -i "s/127.0.0.1:8090/127.0.0.1:${API_PORT}/g" /etc/nginx/sites-available/admision.uprit.edu.pe.conf
  if [[ -f /etc/nginx/sites-available/chatbot.uprit.edu.pe.conf ]]; then
    sudo sed -i "s/127.0.0.1:8090/127.0.0.1:${API_PORT}/g" /etc/nginx/sites-available/chatbot.uprit.edu.pe.conf
  fi
fi

sudo ln -sf /etc/nginx/sites-available/admision.uprit.edu.pe.conf /etc/nginx/sites-enabled/admision.uprit.edu.pe.conf
sudo nginx -t
sudo systemctl reload nginx

echo "==> [4/6] Verificar backend local"
curl -fsS "http://127.0.0.1:${API_PORT}/health"
echo

echo "==> [5/6] SSL Let's Encrypt"
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

echo "==> [6/6] Smoke tests"
curl -fsS -o /dev/null -w "admision HTTP: %{http_code}\n" "http://127.0.0.1/" -H "Host: ${DOMAIN}"
curl -fsS -o /dev/null -w "admision HTTPS: %{http_code}\n" "https://${DOMAIN}/" || echo "WARN: HTTPS aún no responde (revisa DNS/Cloudflare)"

echo
echo "✅ Setup admision completado."
echo "   Panel:  https://${DOMAIN}/"
echo "   Login:  https://${DOMAIN}/login"
echo "   API:    https://${DOMAIN}/api/v1/... (proxy → :${API_PORT})"
echo
echo "Próximos pasos:"
echo "  1. node --env-file=.env deploy/seed-agent-passwords.mjs"
echo "  2. Probar login de un asesor"
echo "  3. Verificar webhook: https://chatbot.uprit.edu.pe/webhook"
