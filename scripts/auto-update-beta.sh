#!/bin/bash
# Auto-update Guardian from the beta branch.
# Cron (*/5) on the Hetzner host. NOTE: despite the name, this deploys
# origin/beta into /opt/guardian — the PRODUCTION checkout and PM2 process.
#
# Safety mechanisms:
#  - self-copy before running (git reset must not rewrite the executing file)
#  - health check: wait for a fresh "Connected as" log line after restart
#  - automatic rollback to the previous SHA on timeout/failure
#  - blocked-SHA denylist so a bad commit is never retried every 5 minutes
#  - optional Discord webhook alert via DEPLOY_WEBHOOK_URL in /opt/guardian/.env
set -uo pipefail

REPO_DIR="/opt/guardian"
GUARDIAN_DIR="${REPO_DIR}/guardian"
BRANCH="beta"
PM2_APP="guardian"
LOG_FILE="/var/log/guardian/auto-update-beta.log"
STATE_DIR="${REPO_DIR}/.deploy-state"
BLOCKED_FILE="${STATE_DIR}/blocked-shas"
HEALTH_TIMEOUT=90

# Re-exec from a stable copy: git reset --hard below replaces this file
# mid-execution otherwise, which can corrupt the running bash script.
if [ "${DEPLOY_SELF_COPIED:-0}" != "1" ]; then
  SELF_COPY="$(mktemp /tmp/auto-update-beta.XXXXXX.sh)"
  cp "$0" "$SELF_COPY"
  chmod +x "$SELF_COPY"
  export DEPLOY_SELF_COPIED=1
  exec bash "$SELF_COPY" "$@"
fi

mkdir -p "$(dirname "$LOG_FILE")" "$STATE_DIR"
touch "$BLOCKED_FILE"

log() { echo "[$(date -Iseconds)] $*" >> "$LOG_FILE"; }

alert() {
  local webhook
  webhook=$(grep -m1 '^DEPLOY_WEBHOOK_URL=' "${REPO_DIR}/.env" 2>/dev/null | cut -d= -f2- | tr -d '"'"'"' \r')
  [ -z "$webhook" ] && return 0
  curl -sf -m 10 -H 'Content-Type: application/json' \
    -d "{\"content\": \"⚠️ Guardian deploy: $*\"}" "$webhook" >/dev/null 2>&1 || true
}

deploy_to() { # $1 = target sha/ref
  git -C "$REPO_DIR" reset --hard "$1" || return 1
  (cd "$GUARDIAN_DIR" && npm ci --omit=dev) || return 1
  if pm2 pid "$PM2_APP" > /dev/null 2>&1; then
    (cd "$GUARDIAN_DIR" && pm2 restart ecosystem.config.js) || pm2 restart "$PM2_APP"
  else
    (cd "$GUARDIAN_DIR" && pm2 start ecosystem.config.js)
  fi
}

wait_for_ready() { # healthy = a "Connected as" log line newer than $1 (epoch)
  local since=$1 deadline=$(( $(date +%s) + HEALTH_TIMEOUT )) last ts
  while [ "$(date +%s)" -lt "$deadline" ]; do
    last=$(pm2 logs "$PM2_APP" --lines 200 --nostream 2>/dev/null \
      | grep 'Connected as' | tail -1 \
      | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}' | head -1)
    if [ -n "$last" ]; then
      ts=$(date -d "$last" +%s 2>/dev/null || echo 0)
      [ "$ts" -ge "$since" ] && return 0
    fi
    sleep 5
  done
  return 1
}

cd "$REPO_DIR" || exit 1
git fetch origin "$BRANCH" || { log "git fetch failed — keeping current code"; exit 1; }

LOCAL=$(git rev-parse "$BRANCH")
REMOTE=$(git rev-parse "origin/$BRANCH")

if [ "$LOCAL" = "$REMOTE" ]; then
  exit 0
fi

if grep -qF "$REMOTE" "$BLOCKED_FILE"; then
  log "Skipping blocked SHA $REMOTE (previously failed health check)."
  exit 0
fi

log "New beta commit detected: $REMOTE (local was $LOCAL)."
DEPLOY_START=$(date +%s)

if deploy_to "origin/$BRANCH" && wait_for_ready "$DEPLOY_START"; then
  log "Deployed $REMOTE — health check passed."
else
  log "Health check FAILED for $REMOTE — rolling back to $LOCAL."
  echo "$REMOTE" >> "$BLOCKED_FILE"
  ROLLBACK_START=$(date +%s)
  if deploy_to "$LOCAL" && wait_for_ready "$ROLLBACK_START"; then
    log "Rollback to $LOCAL succeeded."
    alert "rollback OK — bad SHA $REMOTE blocked"
  else
    log "CRITICAL: rollback to $LOCAL also failed — manual intervention required."
    alert "ROLLBACK FAILED — bot may be down (bad SHA $REMOTE blocked)"
  fi
  exit 1
fi
