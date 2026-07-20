// Dev-only mock of the WF-1 webhook, so you can SEE the instant estimate in a
// browser with zero Docker / zero n8n. Node built-ins only (this is tooling,
// not the shipped widget, so the zero-dep widget rule does not apply here).
//
// It stands in for the two endpoints the widget calls (api.js):
//   GET  .../token  -> a render token (any string; bot defense is mocked off)
//   POST .../lead   -> computes a REAL estimate from the lease data and returns
//                      { status:'received', estimate:{ low, high, comps } }
// and serves the built widget (/embed.js) + a demo page (/) that mounts it
// pointed at this same origin (so no CORS).
//
// Usage: node estimator/mock-server.mjs [port]   (default 8090)
// Then open http://localhost:8090 and submit the form.

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { normalizeLeases, loadIndex, estimateRent } from './src/estimate.js';

const PORT = Number(process.argv[2]) || 8090;
const CSV = 'data/lease-history/propertyware-active-leases-2024-2026.csv';
const INDEX = 'estimator/dist/segment-index.json';

// Prefer the built segment index (the real runtime path); fall back to the CSV.
let leases;
try {
  leases = loadIndex(JSON.parse(readFileSync(INDEX, 'utf8')).records);
  console.log(`loaded ${leases.length} leases from ${INDEX}`);
} catch {
  leases = normalizeLeases(readFileSync(CSV, 'utf8'));
  console.log(`loaded ${leases.length} leases from ${CSV} (index not built yet)`);
}

const embed = readFileSync('widget/dist/embed.js', 'utf8');

const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Instant Rent Estimate — dev demo</title>
<style>body{font-family:system-ui,sans-serif;max-width:640px;margin:40px auto;padding:0 16px;background:#f6f7f9}
h1{font-size:20px}.hint{color:#555;font-size:14px;margin-bottom:24px}code{background:#eee;padding:1px 5px;border-radius:4px}</style>
</head><body>
<h1>Instant Rent Estimate — local dev demo</h1>
<p class="hint">Real estimator, real lease data, mocked webhook. Fill the form (any
name/email/phone), use a DFW ZIP like <code>76052</code>, <code>76108</code>,
<code>76001</code> and a sqft like <code>2000</code>. Wait ~2s before submitting.
The success card shows the instant range + recent nearby own-leases as comps.</p>
<div id="wgc-analysis"></div>
<script src="/embed.js" data-endpoint="http://localhost:${PORT}"
  data-privacy-url="#privacy" data-fallback-url="#analysis" data-source="dev-demo"></script>
</body></html>`;

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); } });
  });
}

const server = createServer(async (req, res) => {
  const url = req.url.split('?')[0];
  const send = (code, type, body) => { res.writeHead(code, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*' }); res.end(body); };

  if (req.method === 'GET' && (url === '/' || url === '/index.html')) return send(200, 'text/html; charset=utf-8', PAGE);
  if (req.method === 'GET' && url === '/embed.js') return send(200, 'application/javascript; charset=utf-8', embed);
  if (req.method === 'GET' && url.endsWith('/token')) return send(200, 'text/plain', randomUUID());

  if (req.method === 'POST' && url.endsWith('/lead')) {
    const lead = await readBody(req);
    const query = { zip: lead.zip, sqft: lead.sqft, beds: lead.bedrooms };
    const est = estimateRent(query, leases);
    const resp = est ? { status: 'received', estimate: est } : { status: 'received' };
    console.log(`POST /lead ${JSON.stringify(query)} -> ${est ? '$' + est.low + '-$' + est.high + ' [' + est.meta.tier + ', n=' + est.meta.sampleSize + ']' : 'no estimate (received card)'}`);
    return send(200, 'application/json', JSON.stringify(resp));
  }
  send(404, 'text/plain', 'not found');
});

server.listen(PORT, () => console.log(`\n  dev demo:  http://localhost:${PORT}\n  (Ctrl+C to stop)\n`));
