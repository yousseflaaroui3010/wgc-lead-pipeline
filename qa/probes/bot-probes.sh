#!/bin/sh
# G-3 bot probes (release-blocking, S4-D1). All three must return the normal
# success body; afterwards verify in the n8n editor that each execution is
# tagged bot=true and NO delivery ran.
# Usage: sh bot-probes.sh https://wgcassetguide.com/hook
set -eu
BASE="${1:?usage: bot-probes.sh <endpoint base, e.g. https://host/hook>}"

PAYLOAD='{"schema_version":"1.0","submission_id":"11111111-2222-4333-8444-555555555555","first_name":"Probe","last_name":"Bot","email":"probe@example.com","phone":"8174451108","property_address":"1 Probe St, Fort Worth, TX","beds":null,"baths":null,"message":null,"source":"Website - wgcassetguide","page_url":"qa-probe","utm":{"source":"","medium":"","campaign":""},"consent":{"tcpa":false,"timestamp":"2026-07-12T00:00:00Z","text_version":"WGC-TCPA-2026-07-v1"}}'

echo "--- probe 1: direct POST, no token (never rendered the page)"
curl -sS -X POST "$BASE/lead" -H 'Content-Type: application/json' \
  -d "$(printf '%s' "$PAYLOAD" | sed 's/}$/,"token":"","company":""}/')"
echo

echo "--- probe 2: stale token (>2h old, forged shape)"
STALE="$(printf '%s' "$(( $(date +%s) * 1000 - 8000000 )).deadbeef.0000000000000000000000000000000000000000000000000000000000000000" | base64 | tr -d '\n')"
curl -sS -X POST "$BASE/lead" -H 'Content-Type: application/json' \
  -d "$(printf '%s' "$PAYLOAD" | sed "s/}$/,\"token\":\"$STALE\",\"company\":\"\"}/")"
echo

echo "--- probe 3: honeypot filled (fetch a real token first, wait out the 2s minimum)"
TOKEN="$(curl -sS "$BASE/token")"
sleep 3
curl -sS -X POST "$BASE/lead" -H 'Content-Type: application/json' \
  -d "$(printf '%s' "$PAYLOAD" | sed "s/}$/,\"token\":\"$TOKEN\",\"company\":\"Acme Bots Inc\"}/")"
echo

echo "--- expected: three identical {\"ok\":true} bodies. Now check WF-1 executions: 3x bot=true, zero deliveries."
