#!/usr/bin/env bash
# SSH into the gmail-automation EC2 instance and check PM2 / system health.
#
# Usage:
#   ./scripts/check-ec2-pm2.sh /path/to/gmail-automation.pem
#   EC2_PEM=~/Downloads/gmail-automation.pem ./scripts/check-ec2-pm2.sh
#
# Deploy latest code + restart worker:
#   ./scripts/check-ec2-pm2.sh /path/to/gmail-automation.pem --deploy

set -euo pipefail

PEM="${1:-${EC2_PEM:-}}"
DEPLOY=false
if [[ "${2:-}" == "--deploy" ]] || [[ "${1:-}" == "--deploy" ]]; then
  DEPLOY=true
  [[ "${1:-}" == "--deploy" ]] && PEM="${EC2_PEM:-}"
fi

EC2_IP="${EC2_IP:-35.154.248.244}"
EC2_USER="${EC2_USER:-ec2-user}"
PROJECT_DIR="${EC2_PROJECT_DIR:-/home/ec2-user/gmail-automation}"

if [[ -z "$PEM" ]]; then
  echo "❌ No SSH key provided."
  echo ""
  echo "Download the 'gmail-automation' key pair from AWS Console:"
  echo "  EC2 → Key Pairs → gmail-automation → Actions → Download"
  echo ""
  echo "Then run:"
  echo "  chmod 400 ~/Downloads/gmail-automation.pem"
  echo "  ./scripts/check-ec2-pm2.sh ~/Downloads/gmail-automation.pem"
  exit 1
fi

if [[ ! -f "$PEM" ]]; then
  echo "❌ Key file not found: $PEM"
  exit 1
fi

chmod 400 "$PEM" 2>/dev/null || true

SSH_OPTS=(-i "$PEM" -o StrictHostKeyChecking=no -o ConnectTimeout=15)

echo "🔗 Connecting to ${EC2_USER}@${EC2_IP}..."
echo ""

REMOTE_SCRIPT=$(cat <<'EOS'
set -e
echo "=== HOST ==="
hostname
uptime
echo ""
echo "=== MEMORY ==="
free -h
echo ""
echo "=== DISK ==="
df -h /
echo ""
echo "=== NODE ==="
which node && node -v
echo ""
echo "=== PM2 ==="
if command -v pm2 >/dev/null 2>&1; then
  pm2 list
  echo ""
  echo "=== PM2 LOGS (last 25 lines) ==="
  pm2 logs --nostream --lines 25 2>/dev/null || true
else
  echo "PM2 not installed"
  ps aux | grep -E 'node.*server|pm2' | grep -v grep || echo "No node worker processes"
fi
EOS
)

if $DEPLOY; then
  echo "🚀 Deploying latest code and restarting PM2..."
  ssh "${SSH_OPTS[@]}" "${EC2_USER}@${EC2_IP}" bash -s <<EOS
set -e
cd "${PROJECT_DIR}"
echo "=== git pull ==="
git pull
echo ""
echo "=== npm install (if needed) ==="
npm install --omit=dev 2>/dev/null || npm install
echo ""
echo "=== pm2 restart ==="
if pm2 describe gmail-automation >/dev/null 2>&1; then
  pm2 restart gmail-automation
elif pm2 describe server >/dev/null 2>&1; then
  pm2 restart server
else
  RUN_AS_WORKER=true pm2 start src/mcp/server.js --name gmail-automation
fi
pm2 save
pm2 list
EOS
  echo ""
  echo "✅ Deploy complete"
else
  ssh "${SSH_OPTS[@]}" "${EC2_USER}@${EC2_IP}" "$REMOTE_SCRIPT"
fi
