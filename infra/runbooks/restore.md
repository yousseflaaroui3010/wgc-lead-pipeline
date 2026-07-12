# Runbook: restore from backup (target: < 2 hours)

REQUIRES-HUMAN-AUTHORIZATION: any restore over a live volume. Practice runs
happen on a scratch box only (S4 ops drill).

1. Fresh VPS: Ubuntu 24.04, Docker + Compose, repo to `/opt/wgc`.
2. Recreate `infra/.env` — `N8N_ENCRYPTION_KEY` MUST be the original offline
   copy; a new key cannot decrypt stored SMTP/API credentials.
3. `sh infra/backup/render-hook-id.sh`
4. Fetch the newest `wgc-n8n-*.tar.gz` from off-box storage; extract.
5. `docker compose up -d n8n` once to create the volume, then stop it and copy
   `database.sqlite` into the volume:
   `docker compose cp database.sqlite n8n:/home/node/.n8n/database.sqlite`
   (workflows-export.json is the fallback if the DB copy is unusable:
   import it via the editor and re-wire per `n8n/README.md`).
6. Point DNS at the new box (REQUIRES-HUMAN-AUTHORIZATION), re-issue the cert
   (deploy runbook step 3), `docker compose up -d`.
7. Smoke test G-1: submit a test lead end to end, confirm CRM/parse delivery
   and the notification email. Log the drill in `docs/build/`.
