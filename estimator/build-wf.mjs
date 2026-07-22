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
const SRC2 = 'estimator/src/rentcast.js';
const NODE = 'Compute estimate';
const check = process.argv.includes('--check');

// The generated marker lets the drift check compare only the generated region.
const BEGIN = '// >>> GENERATED FROM estimator/src/estimate.js — do not edit here';
const END = '// <<< END GENERATED';

function buildJsCode() {
  // estimate.js is zero-dep and only declares functions/consts, so stripping
  // `export ` yields a self-contained script defining loadIndex/estimateRent/etc.
  // Normalize CRLF -> LF so the generated jsCode is byte-identical on Windows
  // and Linux; otherwise a Windows checkout (git autocrlf) embeds \r\n into the
  // node and wf:check drifts against a LF CI runner.
  const readSrc = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n').replace(/^export /gm, '');
  const core = readSrc(SRC);
  const core2 = readSrc(SRC2);
  // Default Code-node mode (run once for all items): use $input.all() + return
  // an array. The index is read once per execution and reused for every item.
  // Layer 1 (own leases) is primary; Layer 3 (RentCast markets) is a cached
  // fallback that only runs on a Layer-1 miss when RENTCAST_API_KEY is set.
  const glue = [
    '',
    '// --- n8n glue: Layer 1 own-data first, RentCast markets (Layer 3) fallback ---',
    "const fs = require('fs');",
    '// n8n exposes env as $env; there is no `process` in the Code-node sandbox.',
    "const INDEX_PATH = ($env && $env.WGC_SEGMENT_INDEX) || '/home/node/.n8n/wgc-estimate/segment-index.json';",
    "const RENTCAST_CACHE = ($env && $env.WGC_RENTCAST_CACHE) || '/home/node/.n8n/wgc-estimate/rentcast-cache.json';",
    "const RENTCAST_KEY = ($env && $env.RENTCAST_API_KEY) || '';",
    'let __records = [];',
    "try { __records = (JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8')).records) || []; } catch (e) { /* index missing -> Layer 1 empty */ }",
    'const __leases = loadIndex(__records);',
    '// RentCast disk cache: { [zip]: { fetchedAt, rentalData } }, 30-day TTL, so',
    "// the free tier's 50 monthly calls serve many visitors per segment.",
    'let __cache = {};',
    "try { __cache = JSON.parse(fs.readFileSync(RENTCAST_CACHE, 'utf8')) || {}; } catch (e) { /* no cache yet */ }",
    'const __now = Date.now();',
    'let __cacheDirty = false;',
    'const __self = this; // capture node context so helpers.httpRequest resolves',
    '',
    '// Async because a Layer-3 cache miss calls RentCast; n8n awaits the returned',
    '// promise. Cache hits and the no-key path never touch the network.',
    'return (async () => {',
    '  const __out = [];',
    '  for (const __it of $input.all()) {',
    '    const __j = __it.json || {};',
    '    const __p = __j.payload || __j; // WF-1 validate node nests the lead under .payload',
    '    let __estimate = estimateRent({ zip: __p.zip, sqft: __p.sqft, beds: __p.bedrooms }, __leases);',
    '    if (!__estimate && RENTCAST_KEY) {',
    "      const __zm = String(__p.zip == null ? '' : __p.zip).match(/\\d{5}/);",
    '      if (__zm) {',
    '        const __z = __zm[0];',
    '        let __entry = __cache[__z];',
    '        if (!isCacheFresh(__entry, __now)) {',
    '          try {',
    '            const __resp = await __self.helpers.httpRequest({',
    "              method: 'GET', url: 'https://api.rentcast.io/v1/markets',",
    "              qs: { zipCode: __z, dataType: 'Rental' },",
    "              headers: { 'X-Api-Key': RENTCAST_KEY, Accept: 'application/json' },",
    '              json: true, timeout: 6000,',
    '            });',
    '            __entry = { fetchedAt: new Date(__now).toISOString(), rentalData: (__resp && __resp.rentalData) || null };',
    '            __cache[__z] = __entry; __cacheDirty = true;',
    '          } catch (e) { __entry = null; /* API down or over quota -> received card */ }',
    '        }',
    '        if (__entry && __entry.rentalData) __estimate = marketToEstimate(__entry.rentalData, { beds: __p.bedrooms, zip: __z });',
    '      }',
    '    }',
    '    __out.push({ json: Object.assign({}, __j, __estimate ? { estimate: __estimate } : {}) });',
    '  }',
    "  if (__cacheDirty) { try { fs.writeFileSync(RENTCAST_CACHE, JSON.stringify(__cache)); } catch (e) { /* cache is best-effort */ } }",
    '  return __out;',
    '})();',
  ].join('\n');
  return `${BEGIN}\n${core}\n\n${core2}\n${END}\n${glue}\n`;
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

// --- rewire: Bot?(false) -> Compute estimate, which FANS OUT to both the
// response and the async WF-2 dispatch. Fanning out (instead of chaining the
// response AFTER the executeWorkflow node and referencing it across that node)
// keeps the estimate on the response node's own input, so n8n paired-item
// tracking cannot drop it. WF-2 still fires; it just no longer feeds Respond. ---
const ref = (name) => ({ node: name, type: 'main', index: 0 });
wf.connections['Bot?'].main[1] = [ref(NODE)];
wf.connections[NODE] = { main: [[ref('Respond success (accepted)'), ref('Dispatch WF-2 (async)')]] };
wf.connections['Dispatch WF-2 (async)'] = { main: [[]] };

// --- accepted response reads the estimate from its OWN input ($json); no
// cross-node reference and no spread, for maximum n8n-expression compatibility ---
wf.nodes.find((n) => n.name === 'Respond success (accepted)').parameters.responseBody =
  '={{ $json.estimate ? { ok: true, estimate: $json.estimate } : { ok: true } }}';

writeFileSync(WF, JSON.stringify(wf, null, 2) + '\n');
console.log(`wf:build OK — injected "${NODE}" (${jsCode.length} chars) + rewired WF-1 accepted path`);
