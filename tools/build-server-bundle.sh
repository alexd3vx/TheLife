#!/usr/bin/env bash
# Rebuilds apps/client/public/server/thelife-server.mjs (served by the website; the VPS setup script downloads it).
set -euo pipefail
cd "$(dirname "$0")/.."
ESB=$(ls -d node_modules/.pnpm/esbuild@*/node_modules/esbuild/bin/esbuild | tail -1)
mkdir -p apps/client/public/server
$ESB packages/server/src/main.ts --bundle --platform=node --format=esm --target=node20 --external:ws --outfile=apps/client/public/server/thelife-server.mjs --log-level=warning
