# n8n middleware — import & wiring guide

> **Topology changed 2026-11-11:** n8n now runs in *regular* mode as a single `main`
> service (pinned `n8nio/n8n:2.44.4`) plus Postgres. The `worker` and `Redis` services
> were removed (measured: n8n memory ~0.85 GB -> ~0.69 GB, two fewer services). Wherever this document says
> "worker", read `main`; set env vars on `main` only. `main`'s `/home/node/.n8n` is still
> ephemeral (its volume is mounted at `/data`, which n8n cannot write as a non-root user),
> so the estimator index must be re-seeded after any `main` redeploy.

The four workflow exports in `workflows/` are the entire server side (ADR-1).
Authored against n8n 1.x node schemas on 2026-07-12. **[VERIFY-AT-BUILD]:
smoke-import each JSON into the running n8n version before go-live; node
`typeVersion`s may need a bump on import (n8n upgrades them automatically —
verify each Code node still shows its script afterwards).**

## Rental estimate data (moved out of n8n, 2026-11-12)

WF-4 (an n8n Rentvine sync) was replaced before going live: the wgcassetguide
`worker` service now syncs Rentvine into its private Postgres and the API
computes the estimate itself (westromhub1 docs/SECURITY.md). The "Rentvine"
Basic Auth credential in n8n is unused and can be deleted.

## Import order & post-import wiring (one-time, ~15 min)

1. Import `wf3-monitors.json`, `wf2-delivery.json`, `wf1-intake.json`,
   `wf0-token.json` (WF-3 first so its ID exists for the others).
2. Create the **WGC SMTP** credential (transactional relay — local postfix is
   banned, S3-D3) and attach it to every Email Send node.
3. In WF-1 → "Dispatch WF-2 (async)": replace `SET-AFTER-IMPORT-WF2-ID` with
   WF-2's actual workflow ID.
4. In WF-1 and WF-2 settings: set the error workflow to WF-3
   (replaces `SET-AFTER-IMPORT-WF3-ID`).
5. Replace `REPLACE-HOOK-ID` in the WF-0 and WF-1 webhook paths with the
   value of `WGC_HOOK_ID` from `infra/.env` (random segment, TD-3
   non-guessable paths; nginx rewrites `/hook/*` to it).
6. ~~Copy `mapping/leadsimple-map.json` into the container.~~ **REMOVED
   2026-08-18.** WF-2 no longer reads any file. That bind mount only ever
   worked under this compose file; on Railway there are no bind mounts and
   the worker's `/home/node/.n8n` is wiped on every redeploy, so the file
   could never exist and every lead silently took the email-parse fallback
   for four weeks. CRM config is env-only now (see the table below), and
   `mapping/leadsimple-map.json` is reference documentation, not config.
7. **Publish** all four workflows (n8n 2.0 replaced the Active toggle with
   a Publish button, top-right / Shift+P; confirmed on 2.29.10, 2026-07-12).
   Re-publish after every edit — saved-but-unpublished changes are not live.
   Static-data dedupe only persists for published production executions.

## Environment contract (set in `infra/.env`)

| Var | Used by | Purpose |
|---|---|---|
| `WGC_HMAC_SECRET` | WF-0, WF-1 | render-token HMAC key (ADR-2) |
| `WGC_GATEWAY_SECRET` | WF-0, WF-1 | **gateway lock (2026-11-10).** Same value as `N8N_GATEWAY_SECRET` on the wgcassetguide.com API. Set = only the `/api/leads/*` gateway can get tokens or submit; unset = open (pre-gateway). Set on BOTH main and worker; see `infra/runbooks/gateway-cutover.md` |
| `LEADSIMPLE_REST_KEY` | WF-2 | **primary CRM auth.** LeadSimple → Settings → Integrations → REST API (enable access first, then the key appears). NOT the Zapier key |
| `LEADSIMPLE_PIPELINE_ID` | WF-2 | `8c50bfc2-6377-4174-b6b2-aa5d252fcdaa` (Owner Leads) |
| `LEADSIMPLE_STAGE_ID` | WF-2 | `eaa0001a-7e05-44f9-9eb6-8a711b91100c` (New Lead) |
| `LEADSIMPLE_SOURCE_NAME` | WF-2 | `Rent Estimator - wgcassetguide.com`, created on first use via `create_source_if_new` |
| `LEADSIMPLE_API_BASE` | WF-2 | optional override; defaults to `https://api.leadsimple.com/rest` |
| `LEADSIMPLE_API_KEY` | — | **DEAD.** The Zapier-only key. LeadSimple's own docs say verbatim "(This API Key is only valid for Zapier)", so it was never a REST credential. Safe to delete from Railway |
| `PARSE_ADDRESS` | WF-2 | LeadSimple per-Source email-parse address; now the FALLBACK only |
| `NOTIFY_EMAILS` | WF-2 | Jon, Ashley, Youssef (comma-separated) |
| `ALERT_EMAIL` | WF-3 | Youssef |
| `MAIL_FROM` | WF-2, WF-3 | sender on the transactional relay |
| `NODE_FUNCTION_ALLOW_BUILTIN` | Code nodes | must include `crypto,fs` |

## Design notes

- **Async hand-off (deliberate deviation from the S1 sequence diagram):**
  WF-1 responds `200 {"ok":true}` immediately after validation and invokes
  WF-2 with `waitForSubWorkflow: false`. WF-2's retry ladder (2s/8s/30s)
  can take ~40s worst case, which would blow past the widget's 10s network
  timeout and show a false error → user retries → dedupe swallows it →
  visible failure for a delivered lead. The no-lead-dropped guarantee is
  server-side: three delivery paths + WF-3 error alerting. Recorded in
  `docs/build/2026-07-12.md`; S4 G-1 asserts end-to-end timing, not the
  HTTP response semantics.
- **No oracle:** every rejection (honeypot, token, validation, duplicate,
  nginx rate limit) returns the same success-shaped body (G-3).
- **Gateway (2026-11-10):** the public entry point is
  `https://wgcassetguide.com/api/leads/{token,lead}` (westromhub1
  `api/src/routes/leads.ts`). It owns per-visitor rate limits, the 3-uses-per-
  token cap, one guide email per address per 24h, daily caps and optional
  Turnstile, and passes the visitor IP/UA as `X-WGC-Client-IP/UA`. On Railway
  there is no nginx in front of n8n, so before this there was no rate limit.
- **Metrics file** `/home/node/.n8n/wgc-metrics.json` holds daily counters
  only — never PII. It feeds the zero-submission alert and the weekly I1
  export. Single-writer volume is fine at this scale; if executions ever
  overlap enough to race, move counters to the SQLite DB (S3-D2 revisit
  trigger applies first).
- **PII prune:** execution data (which contains lead payloads) is pruned by
  n8n env settings in the compose file (`EXECUTIONS_DATA_MAX_AGE=168`,
  7 days per PRD NFR-Privacy). [VERIFY-AT-BUILD: exact env var names
  against the running n8n version's docs.]
