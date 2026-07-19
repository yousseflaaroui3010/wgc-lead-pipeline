// Executes WF-1's generated "Compute estimate" Code node the way n8n runs it
// (a function body with $input + require in scope, returning an item array) and
// proves it (a) runs and (b) produces the SAME estimate as estimate.js. This is
// the parity guarantee for the in-n8n estimator without a live n8n.
//
// Run: node --test estimator/test/wf-estimate.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeLeases, estimateRent } from '../src/estimate.js';

const WF = new URL('../../n8n/workflows/wf1-intake.json', import.meta.url);
const CSV = new URL('../../data/lease-history/propertyware-active-leases-2024-2026.csv', import.meta.url);

// A tiny fixture index (same shape build-index.mjs emits) so the test is
// hermetic and does not depend on the gitignored real data.
const FIXTURE_INDEX = {
  records: [
    { zip: '76052', beds: 3, baths: 2, sqft: 1350, rent: 1895, date: '2026-06-27', uid: 'a' },
    { zip: '76052', beds: 3, baths: 2, sqft: 1450, rent: 1995, date: '2026-05-14', uid: 'b' },
    { zip: '76052', beds: 3, baths: 2, sqft: 1500, rent: 2045, date: '2026-06-14', uid: 'c' },
    { zip: '76052', beds: 3, baths: 2, sqft: 1300, rent: 1795, date: '2026-04-30', uid: 'd' },
    { zip: '76052', beds: 3, baths: 2, sqft: 1600, rent: 2095, date: '2026-03-14', uid: 'e' },
    { zip: '76052', beds: 4, baths: 2, sqft: 2000, rent: 2400, date: '2026-06-01', uid: 'f' },
  ],
};

function loadComputeNode() {
  const wf = JSON.parse(readFileSync(WF, 'utf8'));
  const node = wf.nodes.find((n) => n.name === 'Compute estimate');
  assert.ok(node, 'Compute estimate node must exist in WF-1');
  return node.parameters.jsCode;
}

// Run the node body exactly as n8n's Code node does: a function with $input and
// require available, returning an array of items. fs is stubbed to serve the
// fixture index from the expected path.
function runNode(jsCode, leadItems, indexJson) {
  const fakeRequire = (mod) => {
    if (mod === 'fs') return { readFileSync: () => JSON.stringify(indexJson) };
    return require(mod); // eslint-disable-line
  };
  const $input = { all: () => leadItems.map((json) => ({ json })) };
  const fn = new Function('$input', 'require', 'process', jsCode);
  return fn($input, fakeRequire, { env: {} });
}

test('WF-1 wiring: Compute estimate fans out to Respond + Dispatch, response reads own input', () => {
  const wf = JSON.parse(readFileSync(WF, 'utf8'));
  const c = wf.connections;
  assert.deepEqual(c['Bot?'].main[1].map((x) => x.node), ['Compute estimate']);
  const outs = c['Compute estimate'].main[0].map((x) => x.node);
  assert.ok(outs.includes('Respond success (accepted)'), 'must feed the response directly');
  assert.ok(outs.includes('Dispatch WF-2 (async)'), 'must still dispatch WF-2');
  // Dispatch must NOT also feed Respond (would double-respond).
  assert.equal((c['Dispatch WF-2 (async)'].main[0] || []).length, 0);
  const body = wf.nodes.find((n) => n.name === 'Respond success (accepted)').parameters.responseBody;
  assert.ok(body.includes('$json.estimate'), 'response reads estimate from its own input');
  assert.ok(!body.includes("$('Compute estimate')"), 'no fragile cross-node reference');
});

// The Compute node's real input is WF-1's validate-node output: the lead is
// nested under `payload` (plus bot:false). Tests MUST use this shape.
const leadItem = (p) => ({ bot: false, payload: p });

test('generated Compute estimate node runs and attaches an estimate', () => {
  const out = runNode(loadComputeNode(), [leadItem({ zip: '76052', sqft: 1350, bedrooms: '3', name: 'X' })], FIXTURE_INDEX);
  assert.equal(out.length, 1);
  const j = out[0].json;
  assert.equal(j.payload.name, 'X', 'passes lead fields through');
  assert.ok(j.estimate && typeof j.estimate.low === 'number' && Array.isArray(j.estimate.comps));
});

test('node output equals estimate.js for the same inputs (parity)', () => {
  const leases = loadIndexLike(FIXTURE_INDEX.records);
  const direct = estimateRent({ zip: '76052', sqft: 1350, beds: '3' }, leases);
  const out = runNode(loadComputeNode(), [leadItem({ zip: '76052', sqft: 1350, bedrooms: '3' })], FIXTURE_INDEX);
  assert.deepEqual(out[0].json.estimate, direct);
});

test('no comparable data -> no estimate key (widget shows received card)', () => {
  const out = runNode(loadComputeNode(), [leadItem({ zip: '99999', sqft: 1000, bedrooms: '3' })], FIXTURE_INDEX);
  assert.equal('estimate' in out[0].json, false);
});

test('missing/broken index -> node still returns the lead, no estimate', () => {
  const jsCode = loadComputeNode();
  const $input = { all: () => [{ json: leadItem({ zip: '76052', sqft: 1350, bedrooms: '3' }) }] };
  const throwingRequire = (mod) => (mod === 'fs' ? { readFileSync: () => { throw new Error('ENOENT'); } } : require(mod));
  const out = new Function('$input', 'require', 'process', jsCode)($input, throwingRequire, { env: {} });
  assert.equal(out.length, 1);
  assert.equal('estimate' in out[0].json, false);
});

test('the sanity check on real data (if present) produces a plausible range', () => {
  let csv;
  try { csv = readFileSync(CSV, 'utf8'); } catch { return; } // skip when data absent
  const leases = normalizeLeases(csv);
  const est = estimateRent({ zip: '76052', sqft: 1350, beds: '3' }, leases);
  assert.ok(est.low > 1000 && est.high < 4000 && est.low <= est.high);
});

// Mirror loadIndex for the parity comparison without re-importing internals.
function loadIndexLike(records) {
  return records.map((r) => ({
    zip: r.zip, city: '', type: r.type || '', beds: r.beds, baths: r.baths,
    sqft: r.sqft, rent: r.rent, startDate: r.date ? new Date(r.date) : null,
    uid: r.uid == null ? null : r.uid,
  }));
}
