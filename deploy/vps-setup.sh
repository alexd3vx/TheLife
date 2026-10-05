#!/usr/bin/env bash
# One-command setup of the game server on a fresh Ubuntu/Debian VPS (run as root):
#   curl -fsSL https://raw.githubusercontent.com/alexd3vx/TheLife/claude/hopeful-lovelace-20wkdq/deploy/vps-setup.sh | bash
# It installs Node, the server and Caddy (free HTTPS), and prints the wss:// address to type into "Go online".
set -euo pipefail
BRANCH="${BRANCH:-claude/hopeful-lovelace-20wkdq}"
ORIGIN="${ALLOWED_ORIGINS:-https://thelifesims.vercel.app}"
IP="$(curl -4 -fsS https://api.ipify.org)"
HOST="${DOMAIN:-${IP//./-}.sslip.io}"   # sslip.io turns an IP into a hostname, so HTTPS works without owning a domain

apt-get update -qq
apt-get install -y -qq curl git ca-certificates debian-keyring debian-archive-keyring apt-transport-https gpg
curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
apt-get install -y -qq nodejs
corepack enable
curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor --yes -o /usr/share/keyrings/caddy.gpg
echo "deb [signed-by=/usr/share/keyrings/caddy.gpg] https://dl.cloudsmith.io/public/caddy/stable/deb/debian any-version main" > /etc/apt/sources.list.d/caddy.list
apt-get update -qq && apt-get install -y -qq caddy

rm -rf /opt/thelife && git clone --depth 1 --branch "$BRANCH" https://github.com/alexd3vx/TheLife /opt/thelife
cd /opt/thelife && pnpm install --frozen-lockfile --filter @thelife/server...

cat > /etc/systemd/system/thelife.service <<UNIT
[Unit]
Description=TheLife game server
After=network.target
[Service]
WorkingDirectory=/opt/thelife
Environment=PORT=8787 ROOM=lagos-test ALLOWED_ORIGINS=$ORIGIN
ExecStart=/usr/bin/env pnpm --filter @thelife/server start
Restart=always
[Install]
WantedBy=multi-user.target
UNIT
printf '%s {\n  reverse_proxy 127.0.0.1:8787\n}\n' "$HOST" > /etc/caddy/Caddyfile
systemctl daemon-reload && systemctl enable --now thelife && systemctl restart caddy
sleep 3
echo; echo "Done. Game server address for the game:  wss://$HOST"; echo "Health check: https://$HOST/health"
