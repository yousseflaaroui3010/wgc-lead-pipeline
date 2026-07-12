# Runbook: incident — leads not arriving

Trigger: WF-3 alert (error or zero-submission day), or Jon/Ashley report.

1. **Confirm intake:** SSH tunnel to the n8n editor → Executions. Are WF-1
   executions appearing?
   - No executions → the form or edge is down: check `docker compose ps`,
     `docker compose logs nginx --tail 50`, and hit `/analysis` yourself.
     A cert expiry shows here (certbot container logs).
   - Executions but all `bot=true` → check the `reason` field; a token
     failure spike after a deploy means WGC_HMAC_SECRET or hook-id drift
     between .env, nginx snippet, and the imported webhook paths.
2. **Confirm delivery:** open the latest WF-2 execution.
   - API path red → expected while the key is absent/revoked; confirm the
     fallback engaged (parse-path email in the Source inbox, acceptance G-2).
     If the key was revoked upstream, set `enabled=false` in
     `n8n/mapping/leadsimple-map.json` until it's re-issued.
   - **SMTP red → the real emergency** (single shared dependency): all three
     delivery paths depend on the relay. Switch relay credentials in the n8n
     SMTP credential (REQUIRES-HUMAN-AUTHORIZATION), re-run the failed
     WF-2 executions from the editor (payloads live in execution data for
     7 days).
3. **Recover leads:** any execution that reached "Mark delivered" landed
   somewhere. For ones that didn't, re-run them from the WF-2 trigger node
   after the fix; dedupe lives in WF-1, so re-running WF-2 will not drop them.
4. Log the incident + root cause in `docs/build/` and the project buglog.
