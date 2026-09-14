#!/usr/bin/env bash
#
# upload-env.sh — Copy local .env to EC2 (one-time / when secrets change).
# Usage: ./deploy/upload-env.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
VPS_DIR="${REPO_ROOT}/vps"
ENV_FILE="${REPO_ROOT}/.env"
# shellcheck source=ec2-profile.sh
source "${SCRIPT_DIR}/ec2-profile.sh"
ec2_profile_resolve "${VPS_DIR}"
ec2_profile_ssh_opts

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Error: .env not found at ${ENV_FILE}" >&2
  exit 1
fi

echo "==> Uploading .env (${VPS_PROFILE}) to ${SSH_USER}@${EC2_HOST}:${REMOTE_DIR}/.env"
scp -i "${PEM_FILE}" -o ConnectTimeout=20 "${ENV_FILE}" "${SSH_USER}@${EC2_HOST}:${REMOTE_DIR}/.env"

echo "==> Restarting app container"
ssh -i "${PEM_FILE}" -o ConnectTimeout=20 "${SSH_USER}@${EC2_HOST}" \
  "cd ${REMOTE_DIR} && docker compose up -d app && sleep 3 && curl -fsS http://127.0.0.1:8080/health"

echo "==> Done"
