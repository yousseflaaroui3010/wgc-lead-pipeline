# Local testing guide (before merging to main)

Full pipeline on your machine: widget → nginx (rate limits) → n8n (WF-0..3)
→ Mailpit (catches every email). LeadSimple is not involved — the mapping
adapter ships `enabled=false`, so every lead exercises the email-parse
fallback path, which is exactly the launch configuration (G-2).

## 0. Prereqs (~2 min)

- Start **Docker Desktop** and wait for the engine.
- From the repo root: `npm run check` — 14 tests + size gate must be green.

## 1. Start the stack (~1 min)

```sh
cd infra
docker compose -f docker-compose.dev.yml up -d
```

Three services: nginx → http://localhost:8080, n8n editor →
http://localhost:5678, Mailpit inbox → http://localhost:8025.

## 2. One-time n8n wiring (~10 min)

Open http://localhost:5678, create the (local-only) owner account, then:

1. **Import** the four files from `n8n/workflows/` — WF-3 first, then WF-2,
   WF-1, WF-0 (menu → Import from file).
2. **SMTP credential:** create one named `WGC SMTP` — host `mailpit`, port
   `1025`, no user/password, SSL/TLS **off**. Attach it to every Email Send
   node (5 nodes across WF-2 and WF-3).
3. **Webhook paths:** in WF-0's webhook node change the path to
   `dev-hook/token`; in WF-1's to `dev-hook/lead` (matches wgc.dev.conf).
4. **WF-1 → "Dispatch WF-2 (async)" node:** select WF-2 from the workflow
   dropdown (replaces `SET-AFTER-IMPORT-WF2-ID`).
5. **Error workflow:** in WF-1 and WF-2 → Settings → Error Workflow → WF-3.
6. **Activate all four** (toggle top-right; dedupe static data only persists
   on active workflows).

## 3. Happy path (G-1 shape)

1. Open http://localhost:8080/analysis
2. Fill the form — e.g. phone `(817) 445-1108` — tick the consent box,
   submit. (Don't race: submitting within 2s of page load is silently
   bot-rejected by design.)
3. Expect the success panel, then in **Mailpit (localhost:8025)**:
   - one plain-text email to `parse@localhost.test` — exact one-field-per-line
     template (this is the LeadSimple parse path);
   - one notification to jon/ashley/youssef with
     `Delivery: email-parse fallback`.
4. n8n → Executions: WF-1 succeeded (`bot=false`), WF-2 succeeded.
5. Verify consent evidence in the WF-2 execution input: `tcpa: true`, ISO
   timestamp, `ip`, `user_agent`, `text_version: WGC-TCPA-2026-07-v1`.
   Repeat once with the box **unchecked** → lead still delivers, `tcpa: false`.

## 4. Bot defense (G-3) + dedupe (G-4)

```sh
# from repo root (Git Bash)
sh qa/probes/bot-probes.sh http://localhost:8080/hook
```

All three probes must print `{"ok":true}` with **no** Mailpit email; WF-1
executions show `bot=true` with reasons `token`, `token`, `honeypot`.

Heads-up: the probes themselves use ~4 of your 6 req/min budget — wait a
minute before the next manual test, or you'll hit the silent limiter
(that IS the rate-limit drill: a 7th fast request returns `{"ok":true}`
with no WF-1 execution at all).

G-4: submit the form, then re-POST the same body from DevTools → Network →
"Copy as fetch" — second attempt returns success but WF-1 tags `duplicate`
and only one pair of emails exists in Mailpit.

## 5. CSS isolation + event (G-5, G-7)

Open http://localhost:8080/hostile-host.html:

- The host page's own input must look broken (red dashed, yellow); the
  widget's inputs must be untouched, its submit button visible (host CSS
  sets `button{display:none}`).
- Submit a lead; the "Event log" block must print
  `detail keys: source, submission_id`, `composed: true`, and
  `PII-free key check: PASS`.

## 6. Failure drills (optional but recommended)

- **API-path retry/failover (G-2 shape):** edit `n8n/mapping/leadsimple-map.json`
  → `"enabled": true`, `"url": "http://mailpit:9999/nope"`. Submit a lead:
  WF-2 takes ~40s (2s/8s/30s backoff), then the parse-path email arrives
  anyway and the notification says `email-parse fallback`. Revert the file
  (mount is read-through; no restart needed).
- **No-JS (G-6):** DevTools → Ctrl+Shift+P → "Disable JavaScript" → reload
  /analysis → the noscript contact block shows. On /hostile-host.html the
  plain fallback link inside the div stays visible.
- **Error alert:** stop Mailpit (`docker compose -f docker-compose.dev.yml
  stop mailpit`), submit a lead → WF-2 fails → WF-3 error execution fires
  (its alert email also fails while Mailpit is down — see it in WF-3's
  execution log; this is the documented SMTP-single-dependency emergency).
  Restart Mailpit after.

## 7. Tear down / merge

```sh
docker compose -f docker-compose.dev.yml down   # add -v to drop n8n data
```

Merge gate: steps 3–5 green + `npm run check` green. Then:

```sh
git checkout main
git merge --no-ff feature/F1-lead-pipeline
```

Remember the prod deltas the dev stack hides: TLS/certbot, real
`WGC_HOOK_ID` segment (dev uses `dev-hook`), real transactional SMTP relay,
`.env` secrets, and n8n's editor being tunnel-only.
