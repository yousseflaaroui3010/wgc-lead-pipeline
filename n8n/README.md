# n8n middleware — import & wiring guide

The four workflow exports in `workflows/` are the entire server side (ADR-1).
Authored against n8n 1.x node schemas on 2026-07-12. **[VERIFY-AT-BUILD]:
smoke-import each JSON into the running n8n version before go-live; node
`typeVersion`s may need a bump on import (n8n upgrades them automatically —
verify each Code node still shows its script afterwards).**

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
6. Copy `mapping/leadsimple-map.json` to the container path
   `/home/node/.n8n/wgc/leadsimple-map.json` (the compose file mounts
   `n8n/mapping/` there read-only — edits on the host take effect on the
   next lead).
7. Activate all four workflows (static-data dedupe only persists for
   **active** production executions).

## Environment contract (set in `infra/.env`)

| Var | Used by | Purpose |
|---|---|---|
| `WGC_HMAC_SECRET` | WF-0, WF-1 | render-token HMAC key (ADR-2) |
| `LEADSIMPLE_API_KEY` | WF-2 | CRM REST auth — absent until Jon's admin creates it |
| `PARSE_ADDRESS` | WF-2 | LeadSimple per-Source email-parse address |
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
- **Metrics file** `/home/node/.n8n/wgc-metrics.json` holds daily counters
  only — never PII. It feeds the zero-submission alert and the weekly I1
  export. Single-writer volume is fine at this scale; if executions ever
  overlap enough to race, move counters to the SQLite DB (S3-D2 revisit
  trigger applies first).
- **PII prune:** execution data (which contains lead payloads) is pruned by
  n8n env settings in the compose file (`EXECUTIONS_DATA_MAX_AGE=168`,
  7 days per PRD NFR-Privacy). [VERIFY-AT-BUILD: exact env var names
  against the running n8n version's docs.]
