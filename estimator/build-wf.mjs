// Generate WF-1's "Compute estimate" Code node FROM estimator/src/estimate.js,
// so the in-n8n estimator is never a hand-maintained copy (no parity trap like
// validate.js). Idempotent: re-run after any estimate.js change and commit the
// updated workflow. A drift check (npm run wf:check) fails if they diverge.
//
// It also wires the node into WF-1 (Bot? false -> Compute estimate -> Dispatch
// WF-2) and makes "Respond success (accepted)" carry the estimate.
//
// Usage: node estimator/build-wf.mjs [--check]

import { readFileSync, writeFileSync } from 'node:fs';

const WF = 'n8n/workflows/wf1-intake.json';
const SRC = 'estimator/src/estimate.js';
const NODE = 'Compute estimate';
const check = process.argv.includes('--check');

// The generated marker lets the drift check compare only the generated region.
const BEGIN = '// >>> GENERATED FROM estimator/src/estimate.js — do not edit here';
const END = '// <<< END GENERATED';

function buildJsCode() {
  // estimate.js is zero-dep and only declares functions/consts, so stripping
  // `export ` yields a self-contained script defining loadIndex/estimateRent/etc.
  const core = readFileSync(SRC, 'utf8').replace(/^export /gm, '');
  // Default Code-node mode (run once for all items): use $input.all() + return
  // an array. The index is read once per execution and reused for every item.
  const glue = [
    '',
    '// --- n8n glue: load the mounted segment index, estimate from each lead ---',
    "const fs = require('fs');",
    "const INDEX_PATH = process.env.WGC_SEGMENT_INDEX || '/home/node/.n8n/wgc-segment-index.json';",
    'let __records = [];',
    "try { __records = (JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8')).records) || []; } catch (e) { /* index missing -> no estimate; widget shows the received card */ }",
    'const __leases = loadIndex(__records);',
    'return $input.all().map((__it) => {',
    '  const __j = __it.json || {};',
    '  const __estimate = estimateRent({ zip: __j.zip, sqft: __j.sqft, beds: __j.bedrooms }, __leases);',
    '  return { json: Object.assign({}, __j, __estimate ? { estimate: __estimate } : {}) };',
    '});',
  ].join('\n');
  return `${BEGIN}\n${core}\n${END}\n${glue}\n`;
}

const wf = JSON.parse(readFileSync(WF, 'utf8'));
const jsCode = buildJsCode();

let node = wf.nodes.find((n) => n.name === NODE);

if (check) {
  const current = node ? node.parameters.jsCode : null;
  if (current !== jsCode) {
    console.error('DRIFT: WF-1 "Compute estimate" is out of sync with estimate.js. Run: npm run wf:build');
    process.exit(1);
  }
  console.log('wf:check OK — Compute estimate matches estimate.js');
  process.exit(0);
}

// --- upsert the node ---
if (!node) {
  const dispatch = wf.nodes.find((n) => n.name === 'Dispatch WF-2 (async)');
  const pos = dispatch ? [dispatch.position[0] - 220, dispatch.position[1]] : [0, 0];
  node = {
    parameters: { jsCode },
    id: 'compute-estimate-node',
    name: NODE,
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: pos,
  };
  wf.nodes.push(node);
} else {
  node.parameters.jsCode = jsCode;
}

// --- rewire: Bot?(false, index 1) -> Compute estimate -> Dispatch WF-2 ---
const ref = (name) => ({ node: name, type: 'main', index: 0 });
wf.connections['Bot?'].main[1] = [ref(NODE)];
wf.connections[NODE] = { main: [[ref('Dispatch WF-2 (async)')]] };

// --- accepted response carries the estimate (referenced from the compute node,
// so an intermediate executeWorkflow node cannot drop it) ---
wf.nodes.find((n) => n.name === 'Respond success (accepted)').parameters.responseBody =
  "={{ ({ ok: true, ...( $('Compute estimate').item.json.estimate ? { estimate: $('Compute estimate').item.json.estimate } : {} ) }) }}";

writeFileSync(WF, JSON.stringify(wf, null, 2) + '\n');
console.log(`wf:build OK — injected "${NODE}" (${jsCode.length} chars) + rewired WF-1 accepted path`);
