#!/bin/bash
# Stops the local LEASH indexer stack started by start.sh (data is kept in the envio Docker volumes).
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; LOGS="$HOME/.leash-local"
pkill -f "scripts/envio-local/watch.sh" 2>/dev/null; pkill -f "cloudflared tunnel --url http://localhost:8090" 2>/dev/null; pkill -f "scripts/envio-local/proxy.mjs" 2>/dev/null
pkill -f "envio dev --config config.local.yaml" 2>/dev/null
(cd "$ROOT/indexer" && DOCKER_CONFIG="$LOGS/dockercfg" DOCKER_CONTEXT=desktop-linux pnpm envio stop >/dev/null 2>&1) || true
echo "stopped"
