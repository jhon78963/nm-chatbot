#!/usr/bin/env bash
#
# verify-setup.sh — Pre-flight checks before Meta webhook configuration.
#
set -euo pipefail

EC2_IP="${EC2_IP:-13.217.220.99}"
DOMAIN="${DOMAIN:-chatbot.uprit.edu.pe}"
VERIFY_TOKEN="${META_WEBHOOK_VERIFY_TOKEN:-}"

echo "==> DNS"
dig +short "${DOMAIN}" A || true

echo
echo "==> EC2 direct (ports 22/80/8080)"
for port in 22 80 8080; do
  if nc -z -w 3 "${EC2_IP}" "${port}" 2>/dev/null; then
    echo "  port ${port}: OPEN"
  else
    echo "  port ${port}: closed/timeout"
  fi
done

echo
echo "==> HTTPS health"
curl -fsS --max-time 10 "https://${DOMAIN}/health" && echo || echo "  FAILED"

echo
echo "==> Meta webhook verify (GET)"
if [[ -n "${VERIFY_TOKEN}" ]]; then
  CHALLENGE="verify-$(date +%s)"
  URL="https://${DOMAIN}/webhook?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=${CHALLENGE}"
  RESPONSE="$(curl -fsS --max-time 10 "${URL}" 2>/dev/null || true)"
  echo "  expected: ${CHALLENGE}"
  echo "  got:      ${RESPONSE}"
else
  echo "  set META_WEBHOOK_VERIFY_TOKEN to run this check"
fi
