import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rvRows, rvToRecord, rvDigest, rvBuildIndex, rvDecide, rvAccept, rvSummary,
} from '../src/rentvine.js';
import { loadIndex, estimateRent } from '../src/estimate.js';

const row = (o = {}) => ({
  lease: { leaseID: 1, unitID: 10, rent: '1,895.00', startDate: '2026-03-01 00:00:00', ...(o.lease || {}) },
  unit: { unitID: 10, beds: '3', fullBaths: 2, halfBaths: 1, size: '1,450', address: '1 Main St', postalCode: '76109-1234', ...(o.unit || {}) },
  property: { postalCode: '76001', ...(o.property || {}) },
});

test('maps a Rentvine export row to an index record without PII', () => {
  const r = rvToRecord(row());
  assert.deepEqual(r, { zip: '76109', beds: 3, baths: 2.5, sqft: 1450, rent: 1895, date: '2026-03-01', uid: 'rv10' });
  assert.ok(!JSON.stringify(r).includes('Main'), 'address must never reach the index');
});

test('falls back to the property ZIP and unit rent; rejects unpriceable rows', () => {
  assert.equal(rvToRecord(row({ unit: { address: '', postalCode: '' } })).zip, '76001');
  assert.equal(rvToRecord(row({ lease: { rent: null }, unit: { rent: 1500 } })).rent, 1500);
  assert.equal(rvToRecord(row({ lease: { rent: 0 }, unit: { rent: null } })), null);
  assert.equal(rvToRecord(row({ unit: { postalCode: 'n/a', address: 'x' }, property: { postalCode: '' } })), null);
  assert.equal(rvToRecord(row({ unit: { size: '12' } })).sqft, null, 'implausible sqft is dropped, not trusted');
  assert.equal(rvToRecord(row({ lease: { rent: 95000 } })), null, 'implausible rent rejects the row');
});

test('unwraps list and {data:[...]} pages, ignores junk', () => {
  assert.equal(rvRows([{ json: [row(), row()] }, { json: { data: [row()] } }, { json: row() }, { json: { error: 'x' } }]).length, 4);
});

test('records feed the existing estimator unchanged', () => {
  const rows = Array.from({ length: 30 }, (_, i) => row({ lease: { rent: 1700 + i * 10, unitID: i }, unit: { unitID: i } }));
  const idx = rvBuildIndex(rows, '2026-11-12T00:00:00Z');
  const est = estimateRent({ zip: '76109', sqft: 1450, beds: '3' }, loadIndex(idx.records));
  assert.ok(est && est.low > 0 && est.high >= est.low, 'estimator returns a band from Rentvine records');
});

test('digest is order-independent and changes with the data', () => {
  const a = [rvToRecord(row()), rvToRecord(row({ lease: { unitID: 11 }, unit: { unitID: 11 } }))];
  assert.equal(rvDigest(a), rvDigest([...a].reverse()));
  assert.notEqual(rvDigest(a), rvDigest([a[0], { ...a[1], rent: a[1].rent + 25 }]));
});

test('boot and schedule restore a fresh index instead of calling Rentvine', () => {
  const now = Date.parse('2026-11-12T12:00:00Z');
  const fresh = { index: { generatedAt: '2026-11-12T03:17:00Z', count: 500, records: [] } };
  const stale = { index: { generatedAt: '2026-11-11T03:17:00Z', count: 500, records: [] } };
  assert.equal(rvDecide(fresh, 'boot', null, now).action, 'restore');
  assert.equal(rvDecide(stale, 'schedule', null, now).action, 'sync');
  assert.equal(rvDecide({}, 'boot', null, now).action, 'sync');
});

test('webhook pings and forced syncs are rate limited', () => {
  const now = Date.parse('2026-11-12T12:00:00Z');
  assert.equal(rvDecide({ lastPingAt: '2026-11-12T11:59:50Z' }, 'webhook', 'ping', now).action, 'limited');
  assert.equal(rvDecide({ lastPingAt: '2026-11-12T11:59:00Z' }, 'webhook', 'ping', now).action, 'ping');
  assert.equal(rvDecide({ lastSyncAttemptAt: '2026-11-12T11:55:00Z' }, 'webhook', 'sync', now).action, 'limited');
  assert.equal(rvDecide({ lastSyncAttemptAt: '2026-11-12T11:40:00Z' }, 'webhook', 'sync', now).action, 'sync');
  assert.equal(rvDecide({}, 'webhook', 'anything', now).action, 'status');
});

test('a failed or partial read never replaces a good index', () => {
  const prev = { count: 500, digest: 'a:500' };
  assert.equal(rvAccept(prev, { count: 0 }).ok, false);
  assert.equal(rvAccept(prev, { count: 120, digest: 'b:120' }).ok, false);
  assert.deepEqual(rvAccept(prev, { count: 480, digest: 'a:500' }), { ok: true, changed: false });
  assert.deepEqual(rvAccept(prev, { count: 510, digest: 'c:510' }), { ok: true, changed: true });
  assert.equal(rvAccept(null, { count: 25, digest: 'd' }).ok, true);
});

test('status summary carries counts and times only', () => {
  const idx = rvBuildIndex([row()], '2026-11-12T03:00:00Z');
  const s = rvSummary({ index: idx, lastPing: { rentvine: 'connected' } }, Date.parse('2026-11-12T05:00:00Z'));
  assert.deepEqual(Object.keys(s).sort(), ['ageHours', 'generatedAt', 'lastPing', 'lastSyncAttemptAt', 'lastSyncResult', 'records', 'zips']);
  assert.equal(s.ageHours, 2);
  assert.ok(!JSON.stringify(s).includes('1895'), 'no rents in the public summary');
});
