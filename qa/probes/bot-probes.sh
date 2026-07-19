#!/bin/sh
# G-3 bot probes (release-blocking, S4-D1). All three must return the normal
# success body; afterwards verify in the n8n editor that each execution is
# tagged bot=true and NO delivery ran.
# Usage: sh bot-probes.sh https://wgcassetguide.com/hook
set -eu
BASE="${1:?usage: bot-probes.sh <endpoint base, e.g. https://host/hook>}"

# v2 canonical payload; honeypot field is "fax" (renamed 2026-07-19).
PAYLOAD='{"submission_id":"11111111-2222-4333-8444-555555555555","name":"Probe Bot","email":"probe@example.com","phone":"8174451108","zip":"76052","sqft":1500,"bedrooms":"3","ebook_opt_in":false,"consent":{"implied":true,"text_version":"v2-2026-07-16","ts":"2026-07-19T00:00:00Z"},"fill_ms":9000}'

echo "--- probe 1: direct POST, no token (never rendered the page)"
curl -sS -X POST "$BASE/lead" -H 'Content-Type: application/json' \
  -d "$(printf '%s' "$PAYLOAD" | sed 's/}$/,"token":"","fax":""}/')"
echo

echo "--- probe 2: stale token (>2h old, forged shape)"
STALE="$(printf '%s' "$(( $(date +%s) * 1000 - 8000000 )).deadbeef.0000000000000000000000000000000000000000000000000000000000000000" | base64 | tr -d '\n')"
curl -sS -X POST "$BASE/lead" -H 'Content-Type: application/json' \
  -d "$(printf '%s' "$PAYLOAD" | sed "s/}$/,\"token\":\"$STALE\",\"fax\":\"\"}/")"
echo

echo "--- probe 3: honeypot (fax) filled (fetch a real token first, wait out the 2s minimum)"
TOKEN="$(curl -sS "$BASE/token")"
sleep 3
curl -sS -X POST "$BASE/lead" -H 'Content-Type: application/json' \
  -d "$(printf '%s' "$PAYLOAD" | sed "s/}$/,\"token\":\"$TOKEN\",\"fax\":\"555-0100\"}/")"
echo

echo "--- expected: three identical {\"ok\":true} bodies. Now check WF-1 executions: 3x bot=true, zero deliveries."
