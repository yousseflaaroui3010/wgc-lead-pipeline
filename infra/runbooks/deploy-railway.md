# Runbook: production on Railway (n8n + Brevo + the form)

Current production topology (2026-07-18, supersedes the VPS runbook for
now): TWO Railway projects —
- **Site**: serves wgcassetguide.com (the page + embed.js)
- **n8n**: the middleware (WF-0..WF-3)
Email: Brevo SMTP. Verified against Railway docs (guides/n8n.md,
docs/volumes.md) 2026-07-18.

Known deviations from the S3 VPS design, accepted for this phase:
- No nginx layer → no per-IP rate limit and no success-shaped rate-limit
  responses. Bot defense keeps token + honeypot + min-fill + validation.
- n8n editor is on a public domain (protected by the n8n login) instead of
  SSH-tunnel-only. Use a strong owner password.

---

## Part A — the n8n service (~15 min)

1. Open railway.app → the **n8n project** → click the n8n service.
2. **Volume check (critical — without it every redeploy wipes workflows,
   credentials, and dedupe state):** on the service canvas look for an
   attached volume. If there is none: **right-click the service → Attach
   Volume** → mount path exactly `/home/node/.n8n`. (The official n8n
   template ships with this; a hand-made service may not.)
3. **Domain:** service → **Settings → Networking → Generate Domain** (if
   one doesn't exist). Note it: `https://<your-n8n>.up.railway.app`.
4. **Variables** (service → Variables tab → add; then click the "Apply
   changes" banner to redeploy):

   | Variable | Value |
   |---|---|
   | WEBHOOK_URL | `https://<your-n8n>.up.railway.app/` |
   | N8N_PROTOCOL | `https` |
   | N8N_HOST | `<your-n8n>.up.railway.app` |
   | GENERIC_TIMEZONE | `America/Chicago` |
   | TZ | `America/Chicago` |
   | EXECUTIONS_DATA_PRUNE | `true` |
   | EXECUTIONS_DATA_MAX_AGE | `168` (7-day PII prune) |
   | NODE_FUNCTION_ALLOW_BUILTIN | `crypto,fs` |
   | N8N_BLOCK_ENV_ACCESS_IN_NODE | `false` |
   | WGC_HMAC_SECRET | output of `openssl rand -hex 32` |
   | PARSE_ADDRESS | the LeadSimple new-deal parse address |
   | LEADSIMPLE_API_KEY | the LeadSimple REST key |
   | NOTIFY_EMAILS | jon@…,ashley@…,youssef@… (comma, no spaces) |
   | ALERT_EMAIL | youssef@… |
   | MAIL_FROM | the Brevo-verified sender address |

   ⚠️ **N8N_ENCRYPTION_KEY:** if the service has already run once, a key
   already exists inside the volume — do NOT set a different one (it bricks
   stored credentials). Only set it (openssl rand -hex 32, stored offline)
   on a service that has never started.

5. After redeploy, open `https://<your-n8n>.up.railway.app` → n8n login /
   owner setup.

## Part B — import + wire the workflows (~15 min, rehearsed locally)

Use the **v2** files from `n8n/workflows/` (branch
`task/T-formv2-rental-estimator` until merged).

1. Import in order: WF-3, WF-2, WF-1, WF-0 (Create Workflow → ⋯ → Import
   from File). Ctrl+S each.
2. **Brevo credential** (replaces Mailpit): in WF-2's "Fallback:
   email-parse path" node → Credential → Create new → name `WGC SMTP`:
   Host `smtp-relay.brevo.com`, Port `587`, User = Brevo SMTP login,
   Password = the Brevo **SMTP key** (not the API key), SSL/TLS **OFF**
   (587 upgrades via STARTTLS; if test sends fail, try 465 with SSL ON).
   Select `WGC SMTP` in the other 4 email nodes (1 more in WF-2, 3 in WF-3).
3. **Door names:** generate a secret segment once (`openssl rand -hex 6`,
   e.g. `a1b2c3d4e5f6`). WF-0 webhook Path = `<SEGMENT>/token`; WF-1
   webhook Path = `<SEGMENT>/lead`. Record the segment in infra/.env as
   WGC_HOOK_ID for reference.
4. **CORS (new — needed because the form now posts cross-origin):** in
   BOTH webhook nodes → Options → **Allowed Origins (CORS)** →
   `https://wgcassetguide.com` (add `https://www.westromgroup.com` later
   for the Goodjuju embed).
5. WF-1 "Dispatch WF-2 (async)" → pick **WF-2 Delivery Router**. Settings →
   Error Workflow → **WF-3** on both WF-1 and WF-2.
6. **Publish all four** (Shift+P). Re-publish after every future edit.
7. Door test from your PC:
   `curl https://<your-n8n>.up.railway.app/webhook/<SEGMENT>/token`
   → long scrambled token.

## Part C — point the form at it (~10 min)

In whatever the Site service deploys (repo or folder that serves
wgcassetguide.com):

1. Ship the **v2 build**: copy the current `widget/dist/embed.js` (built
   from the v2 branch, `npm run check` green) to wherever the site serves
   `/embed.js`, and `page/analysis.html` to wherever it serves `/analysis`.
2. In that deployed analysis.html (and any other embed snippet), set:
   `data-endpoint="https://<your-n8n>.up.railway.app/webhook/<SEGMENT>"`
   (the widget itself appends `/token` and `/lead`).
3. Commit/push (or redeploy) the Site service; wait for the deploy to go
   green.

## Part D — prove it end to end (~10 min)

1. Open `https://wgcassetguide.com/analysis` → wait 3s → submit a lead
   with **TEST** in the name.
   - Expect "Request received" (the estimate card waits on Feature 2).
2. **These are REAL emails now:** the notification goes to the real
   NOTIFY_EMAILS inboxes, and the parse email creates a REAL lead in
   LeadSimple — find it there, confirm the fields parsed, then delete the
   test lead.
3. Bot probes (from the repo folder):
   `sh qa/probes/bot-probes.sh https://<your-n8n>.up.railway.app/webhook/<SEGMENT>`
   → three `{"ok":true}`, no new emails, 3 bot=true executions in n8n.
4. Brevo dashboard → Statistics: confirm the sends registered.
5. Optional but recommended: UptimeRobot monitor on
   `https://wgcassetguide.com/analysis` every 5 min.

## Later / parked
- **LeadSimple API path:** stays `enabled=false` until someone copies the
  create-lead spec from app.leadsimple.com/api_docs (behind login). The
  parse path is the designed primary until then (G-2). Enabling will also
  need `leadsimple-map.json` placed at `/home/node/.n8n/wgc/` on the
  volume (no bind mounts on Railway — we'll write it via a one-time
  utility workflow when the time comes).
- **Backups:** the Railway volume persists across deploys but is a single
  copy. Weekly habit: n8n → Workflows → export all to `n8n/workflows/` in
  git (the repo stays the source of truth for logic; credentials/executions
  live only in the volume).
