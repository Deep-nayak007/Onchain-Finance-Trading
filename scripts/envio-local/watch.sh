#!/bin/bash
# Self-healing tunnel: every 60s check the public Envio URL; on failure restart cloudflared and publish the new URL.
#   nohup scripts/envio-local/watch.sh > ~/.leash-local/watch.log 2>&1 &
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; LOGS="$HOME/.leash-local"
q='{"query":"{ chain_metadata { latest_processed_block } }"}'
while true; do
  URL=$(cat "$LOGS/ENVIO_URL" 2>/dev/null || true)
  if ! curl -s -m 15 "$URL" -H 'content-type: application/json' -d "$q" | grep -q '"data"'; then
    echo "$(date -u +%FT%TZ) tunnel down → restarting"
    pkill -f "cloudflared tunnel --no-autoupdate --url http://localhost:8090" 2>/dev/null; sleep 2
    : > "$LOGS/tunnel.log"; nohup cloudflared tunnel --no-autoupdate --url http://localhost:8090 > "$LOGS/tunnel.log" 2>&1 &
    NEW=""; for _ in $(seq 1 60); do NEW=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOGS/tunnel.log" | head -1 || true); [ -n "$NEW" ] && break; sleep 1; done
    if [ -n "$NEW" ]; then
      echo "$NEW/v1/graphql" > "$LOGS/ENVIO_URL"; echo "$NEW/v1/graphql" > "$ROOT/deploy/envio-url.txt"
      "$ROOT/scripts/envio-local/publish-url.sh" "$NEW/v1/graphql" || echo "publish failed (retry next round)"
    fi
  fi
  sleep 60
done
