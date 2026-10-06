#!/usr/bin/env bash
# One-command setup of the TheLife game server on a fresh Ubuntu/Debian VPS (run as root):
#   curl -fsSL https://thelifesims.vercel.app/deploy/vps-setup.sh | bash
# It installs Node, downloads the server from the website, sets it up to start by itself and puts free HTTPS in front of it.
# It prints the wss:// address to type into the game. Run it again any time to update the server.
set -euo pipefail
SITE="${SITE:-https://thelifesims.vercel.app}"
ORIGIN="${ALLOWED_ORIGINS:-$SITE}"
IP="$(curl -4 -fsS https://api.ipify.org)"
HOST="${DOMAIN:-${IP//./-}.sslip.io}"   # sslip.io turns an IP into a hostname, so HTTPS works without owning a domain

echo "==> Installing Node and Caddy"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates debian-keyring debian-archive-keyring apt-transport-https gpg
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs
fi
if ! command -v caddy >/dev/null; then
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor --yes -o /usr/share/keyrings/caddy.gpg
  echo "deb [signed-by=/usr/share/keyrings/caddy.gpg] https://dl.cloudsmith.io/public/caddy/stable/deb/debian any-version main" > /etc/apt/sources.list.d/caddy.list
  apt-get update -qq && apt-get install -y -qq caddy
fi

echo "==> Downloading the game server"
mkdir -p /opt/thelife && cd /opt/thelife
curl -fsSL "$SITE/server/thelife-server.mjs" -o thelife-server.mjs
[ -f package.json ] || echo '{"name":"thelife-server","private":true,"type":"module"}' > package.json
mkdir -p /opt/thelife/data   # every player's life is saved here, so updates never lose anyone
npm install --silent --no-audit --no-fund ws

cat > /etc/systemd/system/thelife.service <<UNIT
[Unit]
Description=TheLife game server
After=network.target
[Service]
WorkingDirectory=/opt/thelife
Environment=PORT=8787 ROOM=lagos-test ALLOWED_ORIGINS=$ORIGIN DATA_DIR=/opt/thelife/data
ExecStart=/usr/bin/node /opt/thelife/thelife-server.mjs
Restart=always
[Install]
WantedBy=multi-user.target
UNIT
printf '%s {\n  reverse_proxy 127.0.0.1:8787\n}\n' "$HOST" > /etc/caddy/Caddyfile
systemctl daemon-reload
systemctl enable --now thelife >/dev/null
systemctl restart thelife
systemctl restart caddy
sleep 4
echo
echo "Done."
echo "Game server address for the game:   wss://$HOST"
echo "Check it in a browser:              https://$HOST/health"
