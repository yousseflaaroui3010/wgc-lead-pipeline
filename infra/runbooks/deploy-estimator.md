# Deploy / refresh the rent estimator (PRD-03) on Railway n8n

The estimator lives entirely in n8n (WF-1's "Compute estimate" node). The widget
already renders the estimate shape (shipped in form v2), so **nothing new deploys
to westromhub1** for this feature. Two moving parts on Railway:

1. **WF-1** — re-imported with the Compute estimate node (generated from
   `estimator/src/estimate.js` via `npm run wf:build`).
2. **The segment index** — an 81 KB gitignored file the Compute node reads at
   `/home/node/.n8n/wgc-estimate/segment-index.json`. Too big for an env var and
   Railway has no bind mount, so it is written onto the worker's disk by a
   one-time seed workflow.

Queue-mode fact: the **worker** executes production webhooks, so both WF-1's
Compute node AND the seed must run on the worker — which they do, because both
are triggered by production webhooks.

---

## STEP 0 — stop any crash first (do this before anything else)

If a WF-1 build with the old `process.env` bug was published, real leads hit
"process is not defined" and error out. Restore a safe WF-1:

1. Editor → delete WF-1 → **Import `n8n/workflows/wf1-intake.json`** (current;
   uses `$env`, not `process`).
2. Re-pick WF-2 in the "Dispatch WF-2" node; set WF-3 as the error workflow.
3. **Publish (Shift+P).**

With no index seeded yet this WF-1 is safe: the Compute node catches the missing
file, returns no estimate, and the lead still flows → the widget shows the
"received" card (leads captured, just no number yet).

Verify: submit a test lead → "received" card (NOT an error), lead email arrives.

---

## STEP 1 — seed the segment index onto the worker

```sh
npm run estimate:index   # (re)build estimator/dist/segment-index.json from the CSV
npm run wf:seed          # -> estimator/dist/wf-seed-index.json  (gitignored, 81 KB inline)
```

In the Railway n8n editor:

1. **Import `estimator/dist/wf-seed-index.json`** ("WGC seed segment index").
2. **Activate** it (a production webhook must be active to receive).
3. Copy its **Production webhook URL** (GET, path `wgc-seed-index`) and open it
   once in a browser. Response should be:
   `{ "ok": true, "wrote": "/home/node/.n8n/wgc-estimate/segment-index.json", "records": 757 }`
4. **Delete** the seed workflow (single use; the URL rewrites the same data if hit
   again, but don't leave it exposed).

---

## STEP 2 — verify estimates are live

Submit **76052 / 1350 sqft / 3 bd** on the form → the **estimate card** (range +
comps) should show. If it shows "received", open the WF-1 execution → the
**Compute estimate** node output:
- no `estimate` → the index isn't on the worker's disk (wrong instance executed
  the seed, or the disk is ephemeral — see STEP 3).
- `estimate` present but response `{ok:true}` → response-node expression issue.

---

## STEP 3 — persistence (only if needed)

If, after a Railway **redeploy**, estimates revert to "received", the worker's
`/home/node/.n8n` is ephemeral. Two fixes:
- Re-run STEP 1 (quick), or
- Attach a **Railway volume** to the worker at `/home/node/.n8n` so the seeded
  file survives redeploys (durable; do the seed once after attaching).

---

## Refreshing the data (monthly lease export)

Rebuild + re-seed: `npm run estimate:index && npm run wf:seed`, then repeat
STEP 1. To change the estimator logic, edit `estimator/src/estimate.js`, run
`npm run wf:build`, commit, and re-import WF-1 (STEP 0).
