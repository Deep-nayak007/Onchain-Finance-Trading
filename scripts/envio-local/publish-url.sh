#!/bin/bash
# Publishes the current Envio URL to deploy/envio-url.txt on main via the GitHub API (only that file; local branches untouched).
# The Brain API reads it (ENVIO_URL_POINTER) within ~60s, so no host env edit/redeploy is needed.
set -euo pipefail
URL="$1"; REPO="yashpy/Onchain-Finance-Trading"; PATH_="deploy/envio-url.txt"
SHA=$(gh api "repos/$REPO/contents/$PATH_?ref=main" --jq .sha 2>/dev/null || true)
CUR=$(gh api "repos/$REPO/contents/$PATH_?ref=main" --jq .content 2>/dev/null | base64 -d 2>/dev/null | tr -d '\n' || true)
[ "$CUR" = "$URL" ] && { echo "pointer already current"; exit 0; }
gh api -X PUT "repos/$REPO/contents/$PATH_" -f message="ops: rotate Envio tunnel URL" -f branch=main \
  -f content="$(printf '%s\n' "$URL" | base64)" ${SHA:+-f sha="$SHA"} --jq .commit.sha >/dev/null
echo "published $URL → $REPO@main:$PATH_"
