// Generate a ONE-TIME, gitignored n8n "seed" workflow that writes the segment
// index onto the n8n filesystem — the way to get the 81 KB index onto Railway
// without a bind mount and without putting client data in git.
//
// How it works: the seed is a WEBHOOK-triggered workflow (production webhooks in
// queue mode run on the WORKER — the same place WF-1's Compute node reads the
// file). Its Code node carries the index inline and fs.writeFileSync's it to the
// exact path the Compute node reads. You import it, activate it, hit its URL
// once, confirm the response, then delete it. Re-generate + re-run on data
// refresh.
//
// The output lives in estimator/dist/ (gitignored) because it embeds client
// rent data — it must never be committed.
//
// Usage: node estimator/build-seed.mjs [inputIndex] [outputWorkflow]

import { readFileSync, writeFileSync } from 'node:fs';

const inIndex = process.argv[2] || 'estimator/dist/segment-index.json';
const outWf = process.argv[3] || 'estimator/dist/wf-seed-index.json';

const index = JSON.parse(readFileSync(inIndex, 'utf8'));

// The Code node's body. $env matches the Compute node's default path, so no
// Railway env var is required — seed and read agree on the location.
const jsCode = [
  "const fs = require('fs');",
  "const target = ($env && $env.WGC_SEGMENT_INDEX) || '/home/node/.n8n/wgc-estimate/segment-index.json';",
  "const dir = target.slice(0, target.lastIndexOf('/'));",
  'try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {}',
  `const INDEX = ${JSON.stringify(index)};`,
  'fs.writeFileSync(target, JSON.stringify(INDEX));',
  'return [{ json: { ok: true, wrote: target, records: (INDEX.records || []).length, generatedAt: INDEX.generatedAt } }];',
].join('\n');

const workflow = {
  name: 'WGC seed segment index (one-time, delete after)',
  nodes: [
    {
      parameters: { httpMethod: 'GET', path: 'wgc-seed-index', responseMode: 'responseNode', options: {} },
      id: 'seed-webhook',
      name: 'Seed webhook',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [0, 0],
      webhookId: 'wgc-seed-index',
    },
    {
      parameters: { jsCode },
      id: 'seed-write',
      name: 'Write index to disk',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [240, 0],
    },
    {
      parameters: { respondWith: 'json', responseBody: '={{ $json }}', options: {} },
      id: 'seed-respond',
      name: 'Respond',
      type: 'n8n-nodes-base.respondToWebhook',
      typeVersion: 1,
      position: [480, 0],
    },
  ],
  connections: {
    'Seed webhook': { main: [[{ node: 'Write index to disk', type: 'main', index: 0 }]] },
    'Write index to disk': { main: [[{ node: 'Respond', type: 'main', index: 0 }]] },
  },
  settings: { executionOrder: 'v1' },
};

writeFileSync(outWf, JSON.stringify(workflow, null, 2) + '\n');
const kb = (Buffer.byteLength(jsCode) / 1024).toFixed(0);
console.log(`wf:seed OK -> ${outWf} (${index.count} records, ~${kb} KB inline). GITIGNORED. Import, activate, GET its webhook URL once, then delete it.`);
