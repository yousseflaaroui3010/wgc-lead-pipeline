# Runbook: deploy

## First-time VPS setup (~1h)
Prereqs — REQUIRES-HUMAN-AUTHORIZATION items done by a human first:
DNS A record for wgcassetguide.com points at the VPS; `N8N_ENCRYPTION_KEY`
generated and stored offline; `infra/.env` filled from `.env.example`.

1. Ubuntu 24.04 LTS, Docker + Compose plugin installed, repo cloned to `/opt/wgc`.
2. `cd /opt/wgc/infra && sh backup/render-hook-id.sh`
3. First cert (nginx can't start TLS without one): run certbot standalone once —
   `docker run --rm -p 80:80 -v wgc_certbot_certs:/etc/letsencrypt certbot/certbot certonly --standalone -d wgcassetguide.com`
4. `docker compose up -d`
5. Import + wire workflows per `n8n/README.md` (SSH tunnel: `ssh -L 5678:localhost:5678 vps` then http://localhost:5678).
6. Install the backup cron (see header of `backup/backup.sh`) and the external
   uptime pinger on `/analysis` [VERIFY-AT-BUILD: chosen service's free tier].
7. Run the S4 smoke set (G-1..G-7 in `qa/checklist.md`).

## Widget release
1. Local: `npm run check` — tests + size gate must both pass (release-blocking, S2-D1).
2. Keep rollback copy on the VPS:
   `cp /opt/wgc/widget/dist/embed.js /opt/wgc/widget/dist/embed.prev.js` (on the box).
3. `scp widget/dist/embed.js vps:/opt/wgc/widget/dist/embed.js`
   (page changes: `scp page/analysis.html vps:/opt/wgc/page/`).
4. No nginx reload needed for static files. Cache is 5 min (`max-age=300`).
5. Smoke: submit the staging form (`/hook-stage/` set per S3 export) or a
   production test lead flagged "TEST" in the message field; confirm the
   notification email arrives; delete the test lead in LeadSimple.

## Rollback (widget)
On the VPS swap the files back:
`cp /opt/wgc/widget/dist/embed.prev.js /opt/wgc/widget/dist/embed.js`
Worst-case exposure is the 5-minute cache window.

## Workflow release
Export the changed workflow to `n8n/workflows/*.json` in git FIRST (the repo
is the source of truth), then import via the editor over the SSH tunnel,
re-wire IDs if the workflow is new, deactivate the old copy, smoke test G-1.
