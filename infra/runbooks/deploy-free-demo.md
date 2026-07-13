# Runbook: FREE demo deployment (pre-invoice)

Purpose: show Jon the working pipeline at zero cost during the trial, then
migrate to the planned VPS (deploy.md) and put that on the invoice.

**Demo-grade, not production.** Documented deviations from the S3 design,
accepted for the demo only (log to PM):
- No nginx → no per-IP rate limiting (bot defense still has token +
  honeypot + server validation) and no success-shaped rate-limit responses.
- Koyeb free sleeps after 1h idle (mitigated by a free pinger); WF-3
  schedules fire only while awake.
- n8n data lives in Supabase Postgres instead of a local SQLite volume.
Verified 2026-07-13: Koyeb free = one 512MB web service, scale-to-zero
forced, no volumes; Koyeb free Postgres is 5h/month → unusable; hence
Supabase. [VERIFY-AT-SIGNUP: each tier's current terms.]

## Phase 1 — Supabase (the memory, ~10 min)
1. supabase.com → new project (free), region US East, strong DB password.
2. Project Settings → Database → note host, port (5432), db name
   (postgres), user, password. Use the **session pooler / direct
   connection** host, not the transaction pooler (n8n needs it).
3. Free projects pause after ~7 days with zero activity; the live n8n
   keeps it active. After long idle stretches, un-pause from the dashboard.

## Phase 2 — Brevo (the email sender, ~10 min)
1. brevo.com → free account → SMTP & API page → note SMTP server
   (smtp-relay.brevo.com), port 587, login, SMTP key.
2. Verify a sender address there (this becomes MAIL_FROM).
3. Free tier ~300 emails/day — plenty (2 emails per lead).

## Phase 3 — Koyeb (runs n8n, ~15 min)
1. koyeb.com → Create Web Service → Docker image `n8nio/n8n`.
2. Instance: Free. Port: 5678. Region: Washington D.C.
3. Environment variables:
   - DB_TYPE=postgresdb
   - DB_POSTGRESDB_HOST / _PORT / _DATABASE / _USER / _PASSWORD = Supabase
     values from Phase 1
   - DB_POSTGRESDB_SSL_ENABLED=true  [VERIFY-AT-SIGNUP: Supabase requires SSL]
   - N8N_ENCRYPTION_KEY = long random string — SAVE IT OFFLINE; losing it
     bricks stored credentials (same rule as prod)
   - WEBHOOK_URL=https://<your-app>.koyeb.app/
   - N8N_HOST=<your-app>.koyeb.app, N8N_PROTOCOL=https
   - GENERIC_TIMEZONE=America/Chicago, TZ=America/Chicago
   - EXECUTIONS_DATA_PRUNE=true, EXECUTIONS_DATA_MAX_AGE=168 (7-day PII
     prune still applies — demo leads are real PII)
   - NODE_FUNCTION_ALLOW_BUILTIN=crypto,fs
   - N8N_BLOCK_ENV_ACCESS_IN_NODE=false
   - WGC_HMAC_SECRET = long random string
   - PARSE_ADDRESS / NOTIFY_EMAILS / ALERT_EMAIL / MAIL_FROM = real values
     (for the demo, NOTIFY_EMAILS can be just Youssef + Jon)
4. Deploy; open https://<your-app>.koyeb.app → n8n setup screen appears.
5. Wire workflows exactly per n8n/README.md + qa/simple-guide.md Part 2,
   with these demo differences:
   - webhook paths: pick a random segment (e.g. `k7f2q9x1/token`,
     `k7f2q9x1/lead`) — this replaces nginx's hidden-path job
   - SMTP credential = Brevo values (host smtp-relay.brevo.com, port 587,
     TLS on) instead of mailpit
   - in BOTH webhook nodes: Options → Allowed Origins (CORS) → set to the
     form page's origin (the Cloudflare Pages URL / wgcassetguide.com)
   - metrics file note: /home/node/.n8n/wgc-metrics.json is wiped on each
     Koyeb redeploy (no volume) — WF-3 counts reset; acceptable for demo
   - leadsimple-map.json is not mounted here; WF-2 already falls back to
     the email-parse path when the file is absent — correct for the demo
6. PUBLISH all four workflows (n8n 2.x: Shift+P; re-publish after every edit).

## Phase 4 — the form page (Cloudflare Pages, ~15 min)
1. Add wgcassetguide.com to Cloudflare (free plan) if not already there;
   update nameservers at the registrar. REQUIRES-HUMAN-AUTHORIZATION:
   DNS/nameserver changes (LD-2 domain).
2. Edit page/analysis.html: set data-endpoint to
   `https://<your-app>.koyeb.app/webhook/<random-segment>` (absolute URL —
   the relative /hook only works when nginx fronts both).
3. `npm run check`, then create a deploy folder containing analysis.html
   (rename to index.html or configure a /analysis route) + embed.js.
4. Cloudflare dashboard → Workers & Pages → Pages → drag-and-drop deploy →
   attach custom domain wgcassetguide.com.
5. The widget POSTs cross-origin to Koyeb — if submits fail in the browser
   console with a CORS error, re-check step 3.5 of Phase 3.

## Phase 5 — keep it awake + watch it (~10 min)
1. uptimerobot.com free → HTTP monitor every 5 min on
   `https://<your-app>.koyeb.app/webhook/<segment>/token`.
   This both prevents Koyeb sleep AND alerts if the pipeline dies.
   (Token GETs are cheap: stateless HMAC, no DB write, no email.)
2. Smoke test = qa/simple-guide.md Parts 3–5 against the live URL.

## Migration to the real VPS later
Everything transfers: same workflow JSONs, same wiring, same credentials
pattern. Export workflows from Koyeb n8n first (repo JSONs are the source
of truth anyway), then follow deploy.md. Retire the Koyeb app after DNS
points at the VPS.
