#!/bin/sh
# Renders nginx/snippets hook_id.conf from .env so the non-guessable webhook
# segment (TD-3) lives in exactly one place. Run after editing WGC_HOOK_ID,
# then `docker compose exec nginx nginx -s reload`.
set -eu
DIR="$(dirname "$0")/.."
. "$DIR/.env"
: "${WGC_HOOK_ID:?WGC_HOOK_ID missing from infra/.env}"
printf 'set $wgc_hook_id "%s";\n' "$WGC_HOOK_ID" > "$DIR/nginx/hook_id.conf"
echo "rendered nginx/hook_id.conf"
