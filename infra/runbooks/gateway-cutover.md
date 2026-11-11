# Runbook: lock n8n behind the wgcassetguide.com lead gateway

**Why:** WF-0 (`/token`) and WF-1 (`/lead`) were public. n8n's "allowed origins"
is a CORS header, not access control, so a script could fetch one token and
replay it for 2 hours with fresh submission IDs. Each replay could create a
LeadSimple deal, email the team, and send the guide email from our Brevo account
to any address. Railway has no nginx in front of n8n, so nothing rate-limited it.

**What changes:** the widget posts to `https://wgcassetguide.com/api/leads`. The
gateway applies per-visitor limits and caps, then calls these webhooks with
`X-WGC-Gateway: <secret>`. With `WGC_GATEWAY_SECRET` set, n8n refuses everything
else (WF-0 returns an empty token; WF-1 silently rejects with `reason: gateway`).

## Order (do not skip ahead)

1. The westromhub1 change is deployed and `/api/leads/token` returns a token:
   `curl -s https://wgcassetguide.com/api/leads/token` prints a base64 string.
   (The API needs `N8N_LEAD_WEBHOOK_BASE` and `N8N_GATEWAY_SECRET`.)
2. Every page that embeds the form loads `https://wgcassetguide.com/embed.js`
   (not a self-hosted copy) and has no `data-endpoint` pointing at the
   `*.up.railway.app` n8n host. The old documented `data-endpoint=".../hook"`
   works: nginx maps it to the gateway.
3. In n8n, import `n8n/workflows/wf0-token.json` and `wf1-intake.json` (same
   IDs and paths; `wf-import-safety.test.mjs` guards that) and **Publish** both.
   With the secret still unset, behaviour is unchanged.
4. **Before** step 5: since 2026-11-11 n8n is a single `main` service (no
   worker). Its `/home/node/.n8n` is ephemeral, so the redeploy in step 5 wipes
   `/home/node/.n8n/wgc-estimate/segment-index.json` and the metrics file.
   Plan to re-seed right after (`deploy-estimator.md` STEP 1).
5. Set `WGC_GATEWAY_SECRET` (the same value as the API's `N8N_GATEWAY_SECRET`)
   on the n8n `main` service.
6. Verify:
   - `curl -s https://main-production-bf72.up.railway.app/webhook/d043c102d78e/token`
     → empty body (locked).
   - Submit the form on `/analysis` → estimate shows. If you ticked the guide
     box: a LeadSimple deal plus the team and guide emails. The WF-1 execution
     shows `bot: false`.
   - Execution `consent.ip` is your real IP, not a Railway/Cloudflare address.

## Rollback

Delete `WGC_GATEWAY_SECRET` from `main`. The webhooks are open again
and the gateway keeps working (it still sends the header; n8n ignores it).
