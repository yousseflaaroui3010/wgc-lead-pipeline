// Runs WF-4's generated Code nodes the way n8n does: $input, $env,
// $getWorkflowStaticData, require('fs'). Exercises every path end to end.
import { test } from 'node:test';
import { readFileSync, mkdtempSync, existsSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import os from 'node:os';
const require = createRequire(import.meta.url);
const wf = JSON.parse(readFileSync(new URL('../workflows/wf4-rentvine-sync.json', import.meta.url), 'utf8'));
const code = (name) => wf.nodes.find((n) => n.name === name).parameters.jsCode;
const dir = mkdtempSync(join(os.tmpdir(), 'wf4-'));
const $env = { WGC_SEGMENT_INDEX: join(dir, 'idx', 'segment-index.json') };
const state = {};
function run(name, items) {
  const fn = new Function('$input', '$env', '$getWorkflowStaticData', 'require', code(name));
  return fn({ all: () => items, first: () => items[0] }, $env, () => state, require);
}
const row = (i, rent) => ({ lease: { unitID: i, rent, startDate: '2026-01-01' }, unit: { unitID: i, beds: 3, size: 1400, address: 'x', postalCode: '76109' }, property: {} });
const page = (n, base) => ({ json: Array.from({ length: n }, (_, i) => row(base + i, 1700 + i)) });
const checks = [];
const ok = (c, m) => checks.push([!!c, m]);

// 1. boot with nothing stored -> sync
let d = run('Decide (cache + rate limits)', [{ json: { event: 'Instance started' } }])[0].json;
ok(d.action === 'sync' && d.trigger === 'boot', 'boot with no index -> sync');
// 2. build from two pages (list shape + {data} shape)
let b = run('Build index (keep last good)', [page(100, 0), { json: { data: Array.from({ length: 30 }, (_, i) => row(200 + i, 1800)) } }])[0].json;
ok(b.ok && b.records === 130 && existsSync($env.WGC_SEGMENT_INDEX), 'sync builds 130 records and writes the file');
const file = JSON.parse(readFileSync($env.WGC_SEGMENT_INDEX, 'utf8'));
ok(!('digest' in file) && file.records.length === 130 && !JSON.stringify(file).includes('"x"'), 'file has records, no digest, no address');
ok(!JSON.stringify(b).includes('1700'), 'response carries no rents');
// 3. failed Rentvine read keeps the last good index
b = run('Build index (keep last good)', [{ json: { error: { message: '401' } } }])[0].json;
ok(!b.ok && b.records === 130 && state.lastSyncResult.why === 'Rentvine request failed', 'failed read keeps last good index');
// 4. partial read (shrinks a lot) rejected
b = run('Build index (keep last good)', [page(30, 0)])[0].json;
ok(!b.ok && b.records === 130, 'partial read (30 of 130) rejected');
// 5. unchanged data -> no rebuild, freshness bumped
const before = state.index.digest;
b = run('Build index (keep last good)', [page(100, 0), { json: { data: Array.from({ length: 30 }, (_, i) => row(200 + i, 1800)) } }])[0].json;
ok(b.ok && state.lastSyncResult.changed === false && state.index.digest === before, 'same data -> cached, not regenerated');
// 6. boot again with fresh index and missing file -> restore, no Rentvine call
rmSync($env.WGC_SEGMENT_INDEX);
d = run('Decide (cache + rate limits)', [{ json: { event: 'Instance started' } }])[0].json;
ok(d.action === 'restore' && existsSync($env.WGC_SEGMENT_INDEX), 'boot with fresh index -> restore file from database, no Rentvine');
// 7. webhook: a forced sync right after the boot sync is refused; later allowed
d = run('Decide (cache + rate limits)', [{ json: { headers: {}, query: { do: 'sync' } } }])[0].json;
ok(d.action === 'limited', 'forced sync right after a boot sync -> limited');
state.lastSyncAttemptAt = new Date(Date.now() - 11 * 60e3).toISOString();
d = run('Decide (cache + rate limits)', [{ json: { headers: {}, query: { do: 'sync' } } }])[0].json;
ok(d.action === 'sync', 'first forced sync allowed');
d = run('Decide (cache + rate limits)', [{ json: { headers: {}, query: { do: 'sync' } } }])[0].json;
ok(d.action === 'limited', 'second forced sync within 10 min -> limited');
// 8. ping path
d = run('Decide (cache + rate limits)', [{ json: { headers: {}, query: { do: 'ping' } } }])[0].json;
ok(d.action === 'ping', 'ping allowed');
let p = run('Ping result', [{ json: { statusCode: 200, body: [] } }])[0].json;
ok(p.ok && p.lastPing.rentvine === 'connected', 'ping 200 -> connected');
p = run('Ping result', [{ json: { statusCode: 401 } }])[0].json;
ok(!p.ok && p.lastPing.rentvine === 'auth_failed', 'ping 401 -> auth_failed');
d = run('Decide (cache + rate limits)', [{ json: { headers: {}, query: { do: 'ping' } } }])[0].json;
ok(d.action === 'limited', 'repeat ping within 30 s -> cached');
const f = run('Status / cached answer', [{ json: d }])[0].json;
ok(f.records === 130 && f.lastPing && !JSON.stringify(f).includes('1700'), 'status shows counts only');
rmSync(dir, { recursive: true });

for (const [pass, name] of checks) test(name, () => { if (!pass) throw new Error(name); });
