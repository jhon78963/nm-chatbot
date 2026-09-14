#!/usr/bin/env bash
# dspace-health.sh — Prevent DSpace/Tomcat CPU spikes from stale PostgreSQL connections.
# Install on VPS:
#   sudo cp deploy/dspace-health.sh /usr/local/bin/dspace-health.sh
#   sudo chmod +x /usr/local/bin/dspace-health.sh
#   echo "*/15 * * * * root /usr/local/bin/dspace-health.sh >> /var/log/dspace-health.log 2>&1" | sudo tee /etc/cron.d/dspace-health

set -euo pipefail

LOG_PREFIX="[dspace-health $(date -Iseconds)]"
CONN_THRESHOLD="${CONN_THRESHOLD:-100}"
TOMCAT_URL="${TOMCAT_URL:-http://127.0.0.1:8080/}"
TOMCAT_TIMEOUT="${TOMCAT_TIMEOUT:-5}"

log() { echo "${LOG_PREFIX} $*"; }

pg_count() {
  sudo -u postgres psql -Atq -c \
    "SELECT count(*) FROM pg_stat_activity WHERE datname = 'dspace';" 2>/dev/null || echo 0
}

terminate_stale() {
  local n
  # Only kill leaked transactions; plain idle pool connections are normal.
  n=$(sudo -u postgres psql -Atq -c \
    "SELECT count(*) FROM pg_stat_activity WHERE datname = 'dspace' AND state = 'idle in transaction' AND pid <> pg_backend_pid();" 2>/dev/null || echo 0)
  if [[ "${n}" -gt 0 ]]; then
    log "Terminating ${n} idle-in-transaction connection(s)"
    sudo -u postgres psql -q -c \
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'dspace' AND state = 'idle in transaction' AND pid <> pg_backend_pid();" \
      >/dev/null 2>&1 || true
  fi
}

tomcat_ok() {
  curl -sf --max-time "${TOMCAT_TIMEOUT}" -o /dev/null "${TOMCAT_URL}"
}

total=$(pg_count)
log "dspace connections: ${total}"

if [[ "${total}" -ge "${CONN_THRESHOLD}" ]]; then
  log "WARN: connection count >= ${CONN_THRESHOLD}, cleaning stale sessions"
  terminate_stale
  total=$(pg_count)
  log "dspace connections after cleanup: ${total}"
fi

wait_for_tomcat() {
  local attempt
  for attempt in $(seq 1 24); do
    if tomcat_ok; then
      log "Tomcat ready after ${attempt} attempt(s)"
      return 0
    fi
    sleep 5
  done
  return 1
}

if ! tomcat_ok; then
  log "WARN: Tomcat not responding at ${TOMCAT_URL}, restarting"
  sudo systemctl restart tomcat
  if wait_for_tomcat; then
    log "Tomcat recovered after restart"
  else
    log "ERROR: Tomcat still not responding after restart"
    exit 1
  fi
else
  log "Tomcat OK"
fi
