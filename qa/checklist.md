# QA checklist — S4-A1 execution sheet

Staging = same box, `/hook-stage/` routed to a cloned workflow set (S3 export).
Every row gets: date, tester, PASS/FAIL, evidence link (screenshot/log line).

## Acceptance criteria (release-blocking)

| # | Test | How |
|---|---|---|
| G-1 | Valid lead → CRM (or parse path pre-key) + notify ≤60s | Submit on staging with consent checked; compare submission consent.timestamp vs notification Received header; verify source tag + full consent object on the lead |
| G-2 | API dead → parse path ≤5 min + alert | Set a poison `url` in leadsimple-map.json with `enabled=true`; submit; verify parse-path email + WF-3 error alert; restore map |
| G-3 | Bots rejected silently (release-blocking, S4-D1) | Run `qa/probes/bot-probes.sh staging`; all three probes must return the normal success body with no CRM entry and `bot=true` tags in WF-1 executions |
| G-4 | Double-click → one lead | UI: double-click submit. API: replay the same POST (captured via DevTools) twice; assert one delivery, second tagged `duplicate` |
| G-5 | Event observable, composed, no PII | Open `qa/fixtures/hostile-host.html`; submit; the page logs the event detail — assert keys are exactly `source`, `submission_id` |
| G-6 | No-JS fallback | Disable JS; embed page shows the link; follow it to `/analysis`; the noscript block offers a working contact path |
| G-7 | Host CSS cannot leak (release-blocking) | `hostile-host.html` sets `input{border:5px dashed red!important}` + hostile fonts; widget inputs must be visually unchanged |

## Suites

- **Validation matrix:** `npm test` (14 unit tests incl. the S4 phone set) —
  then replay the same fixtures as raw POSTs against staging WF-1 and assert
  identical accept/reject per fixture (client/server parity).
- **Consent evidence:** submit checked and unchecked; payload carries
  tcpa true/false, ISO timestamp, IP, UA, text_version `WGC-TCPA-2026-07-v1`;
  the unchecked lead still delivers (FR-2).
- **Accessibility:** keyboard-only completion; visible focus on every control;
  labels announced; error announced via aria-live (NVDA or VoiceOver spot
  check); AA contrast on text and error red.
- **Compatibility:** Chrome/Firefox/Edge/Safari last-2 desktop + iOS Safari 15
  device/simulator. Watch: token GET, Shadow DOM render, and the
  crypto.randomUUID fallback branch on Safari 15.0–15.3.
- **Performance:** `npm run build` gate green (≤15,360 B gzip; current build
  4,817 B); embed on a test page and confirm zero layout shift (reserved
  min-height holds).
- **Privacy:** after 8 days on staging, confirm pruned executions carry no
  payload PII; confirm event detail, dataLayer entries, and
  localStorage/sessionStorage are PII-free after a submit.
- **Ops drills (with S3):** restore-from-backup on a scratch box (<2h);
  rate-limit probe (7th request within a minute gets the success-shaped
  limit response); zero-submission alert observed on a quiet staging day.

## Launch gate (Definition of Done)

1. G-1..G-7 green on staging
2. Validation, consent, a11y, compat suites green
3. Size gate green
4. OD-6 consent wording confirmed by Jon (v1 text ships only with Jon's
   explicit logged acceptance of "pending counsel")
5. OD-7 "X business days" set → pass `data-sla-days` in the embed snippet
6. Backups verified by an actual restore
7. `docs/embed-handoff.md` delivered (Goodjuju snippet + iframe fallback)
8. Instrument I1 receiving weekly exports
