# wgc-lead-pipeline playbook

Free Rental Analysis form widget + n8n lead pipeline. Binding contracts:
PRD-02 v1.1 §E (canonical lead schema v1.0) and TD-1..TD-4 in
`../docs/prd.md`. Architecture: `../docs/architecture.md` (S1–S4).

## Hard rules
- Canonical schema v1.0 and TD-1..TD-4 are locked; changes need PM sign-off.
- No lead database of ours (ADR-5).
- CRM config is ENV-ONLY, on BOTH the n8n main and worker services
  (DECISIONS 2026-08-18). ADR-4's intent stands (one documented home for CRM
  specifics: `n8n/mapping/leadsimple-map.json`) but its mechanism is dead —
  that file is REFERENCE ONLY and is not read at runtime. It was bind-mounted
  from the abandoned VPS design; Railway has no bind mounts, so it never
  existed in production and swallowed every lead for four weeks.
- DRIFT, needs a human decision, do not silently resolve: this file used to
  state "No instant rent estimate anywhere (LD-6)". The rent estimator has
  been live and verified since 2026-07-20. Either LD-6 was superseded by a
  later decision that nobody recorded, or it is being violated. Find the
  decision or write one; the constraint is parked here meanwhile.
- Bundle >15,360 B gzip = build failure (S2-D1). Zero runtime deps (TD-4).
- Bot rejects always return success-shaped bodies — no oracle (G-3).
- Never integrate against Propertyware (Rent Engine migration ~Sept 2026).
- Secrets in `infra/.env` only; never in client JS or git.

## Commands
- `npm test` — 101 tests (validation matrix, payload contract, a11y,
  estimator parity, and WF-2 CRM delivery)
- `npm run build` — esbuild → `widget/dist/embed.js` + gzip size gate
- `npm run check` — both; must pass before any commit

## Layout
- `widget/src/` form.js (entry), validate.js, api.js, styles.css
- `n8n/workflows/` WF-0 token, WF-1 intake, WF-2 delivery, WF-3 monitors
  (import wiring: `n8n/README.md`)
- `infra/` compose + nginx + runbooks · `qa/` checklist + fixtures + probes
- `docs/build/` daily journal + decisions

## Parity trap
WF-1's validation code (wf1-intake.json) mirrors `widget/src/validate.js`.
Any rule change edits BOTH and reruns the S4 parity fixtures.

## Pending (copy, not code)
OD-6 consent wording (counsel) · OD-7 `data-sla-days` value ·
privacy-policy URL (Jon).
RESOLVED 2026-08-18: the LeadSimple field map. There is a real REST API; the
verified contract is recorded in `n8n/mapping/leadsimple-map.json`.
