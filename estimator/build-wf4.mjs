// Generate WF-4 "Rentvine sync" from estimator/src/rentvine.js (the Code nodes
// embed it, so the n8n copy is never hand-maintained). Re-run after any change
// to rentvine.js; `npm run wf:check` fails on drift.
//
// What WF-4 does:
//   - On n8n start: restore the estimator index file from the copy kept in
//     n8n's own database (workflow static data). Rentvine is only called when
//     that copy is older than RV_FRESH_HOURS. The index file lives on n8n's
//     ephemeral disk, so this is what makes it survive redeploys and wakes.
//   - Nightly 03:17 (GENERIC_TIMEZONE): refresh from Rentvine.
//   - Webhook GET .../webhook/wgc-rentvine/<id>?do=ping|status|sync
//     returns counts and timestamps only (never rents or addresses);
//     ping <= 1 per 30 s and forced sync <= 1 per 10 min, else cached answer.
// Rentvine is called with the n8n credential named "Rentvine" (HTTP Basic:
// API key / API secret, encrypted in n8n's database). Paging is paced at one
// request per 3 s (<= 20/min; Rentvine allows 100/min per account, shared
// with the security-deposit app) and capped at 40 pages.
//
// Usage: node estimator/build-wf4.mjs [--check]

import { readFileSync, writeFileSync } from 'node:fs';

const OUT = 'n8n/workflows/wf4-rentvine-sync.json';
const SRC = 'estimator/src/rentvine.js';
const CORP = 'westromgroup'; // RENTVINE_CORPORATION_ID (not secret)
const BASE = `https://${CORP}.rentvine.com/api/manager/`;
const HOOK = 'wgc-rentvine/8f3c1e6a92d4b7f0';
const check = process.argv.includes('--check');

const BEGIN = '// >>> GENERATED FROM estimator/src/rentvine.js — do not edit here';
const END = '// <<< END GENERATED';

const lib = readFileSync(SRC, 'utf8')
  .replace(/\r\n/g, '\n')
  .replace(/^export \{[\s\S]*?\};\s*$/m, '')
  .replace(/^export /gm, '')
  .trim();

const common = [
  BEGIN,
  lib,
  END,
  '',
  "const fs = require('fs');",
  "const INDEX_PATH = ($env && $env.WGC_SEGMENT_INDEX) || '/home/node/.n8n/wgc-estimate/segment-index.json';",
  "const state = $getWorkflowStaticData('global');",
  'const nowMs = Date.now();',
  'const nowIso = new Date(nowMs).toISOString();',
  'function writeIndexFile(idx) {',
  "  const dir = INDEX_PATH.slice(0, INDEX_PATH.lastIndexOf('/'));",
  '  try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {}',
  '  const { digest, ...file } = idx;',
  '  fs.writeFileSync(INDEX_PATH, JSON.stringify(file));',
  '}',
  'function fileMatches(idx) {',
  "  try { const f = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8')); return f && f.count === idx.count && f.generatedAt === idx.generatedAt; } catch (e) { return false; }",
  '}',
  '',
].join('\n');

const decideCode = common + [
  '// Which trigger fired? Webhook items carry headers; the n8n trigger an event.',
  'const j = ($input.first() || {}).json || {};',
  "const trigger = j.headers ? 'webhook' : (/start|init/i.test(String(j.event || j.trigger || '')) ? 'boot' : 'schedule');",
  "const want = trigger === 'webhook' ? String((j.query || {}).do || 'status').toLowerCase() : null;",
  'const d = rvDecide(state, trigger, want, nowMs);',
  "if (d.action === 'sync') state.lastSyncAttemptAt = nowIso;",
  "if (d.action === 'ping') state.lastPingAt = nowIso;",
  "if (d.action === 'restore' && state.index && !fileMatches(state.index)) writeIndexFile(state.index);",
  'return [{ json: { action: d.action, reason: d.reason, trigger } }];',
].join('\n');

const buildCode = common + [
  'const items = $input.all();',
  'const failed = items.find((it) => it.json && it.json.error);',
  'const next = rvBuildIndex(rvRows(items), nowIso);',
  'const prev = state.index || null;',
  'const verdict = failed ? { ok: false, why: "Rentvine request failed" } : rvAccept(prev, next);',
  'if (verdict.ok) {',
  '  if (verdict.changed || !prev) { state.index = next; } else { state.index = { ...prev, generatedAt: nowIso }; }',
  '  writeIndexFile(state.index);',
  "  state.lastSyncResult = { ok: true, changed: !!verdict.changed, records: state.index.count, at: nowIso };",
  '} else {',
  '  // Keep serving the previous index; make sure the file is there.',
  '  if (prev && !fileMatches(prev)) writeIndexFile(prev);',
  '  state.lastSyncResult = { ok: false, why: verdict.why, at: nowIso };',
  '}',
  "return [{ json: { ok: verdict.ok, action: 'sync', ...rvSummary(state, nowMs) } }];",
].join('\n');

const pingCode = common + [
  'const r = ($input.first() || {}).json || {};',
  'const code = Number(r.statusCode || (r.error && r.error.status) || 0);',
  "const rentvine = code >= 200 && code < 300 ? 'connected' : (code === 401 || code === 403 ? 'auth_failed' : 'unreachable');",
  'state.lastPing = { rentvine, httpStatus: code || null, at: nowIso };',
  "return [{ json: { ok: rentvine === 'connected', action: 'ping', ...rvSummary(state, nowMs) } }];",
].join('\n');

const finishCode = common + [
  'const d = ($input.first() || {}).json || {};',
  'return [{ json: { ok: true, action: d.action, reason: d.reason, ...rvSummary(state, nowMs) } }];',
].join('\n');

const cred = { httpBasicAuth: { id: '', name: 'Rentvine' } };

const workflow = {
  name: 'WF-4 Rentvine sync',
  nodes: [
    {
      parameters: { events: ['init'] },
      id: 'wf4-boot', name: 'On n8n start', type: 'n8n-nodes-base.n8nTrigger', typeVersion: 1, position: [0, 0],
    },
    {
      parameters: { rule: { interval: [{ field: 'cronExpression', expression: '17 3 * * *' }] } },
      id: 'wf4-nightly', name: 'Nightly 03:17', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: [0, 200],
    },
    {
      parameters: {
        httpMethod: 'GET', path: HOOK, responseMode: 'responseNode',
        // Server-to-server endpoint; browsers have no reason to call it.
        options: { allowedOrigins: 'https://wgcassetguide.com' },
      },
      id: 'wf4-hook', name: 'Webhook (ping/status/sync)', type: 'n8n-nodes-base.webhook', typeVersion: 2,
      position: [0, 400], webhookId: '8f3c1e6a-92d4-4b7f-a011-5e2b9d7c4f10',
    },
    {
      parameters: { jsCode: decideCode },
      id: 'wf4-decide', name: 'Decide (cache + rate limits)', type: 'n8n-nodes-base.code', typeVersion: 2, position: [260, 200],
    },
    {
      parameters: { conditions: { string: [{ value1: '={{ $json.action }}', value2: 'sync' }] } },
      id: 'wf4-if-sync', name: 'Sync?', type: 'n8n-nodes-base.if', typeVersion: 1, position: [500, 200],
    },
    {
      parameters: { conditions: { string: [{ value1: '={{ $json.action }}', value2: 'ping' }] } },
      id: 'wf4-if-ping', name: 'Ping?', type: 'n8n-nodes-base.if', typeVersion: 1, position: [740, 320],
    },
    {
      parameters: {
        url: BASE + 'leases/export',
        authentication: 'genericCredentialType', genericAuthType: 'httpBasicAuth',
        sendQuery: true,
        queryParameters: { parameters: [
          { name: 'primaryLeaseStatusIDs[]', value: '2' },
          { name: 'pageSize', value: '100' },
        ] },
        options: {
          pagination: { pagination: {
            paginationMode: 'updateAParameterInEachRequest',
            parameters: { parameters: [{ type: 'qs', name: 'page', value: '={{ $pageCount + 1 }}' }] },
            paginationCompleteWhen: 'other',
            completeExpression: '={{ (Array.isArray($response.body) ? $response.body : (($response.body || {}).data || [])).length < 100 }}',
            limitPagesFetched: true, maxRequests: 40, requestInterval: 3000,
          } },
          timeout: 30000,
        },
      },
      id: 'wf4-leases', name: 'Rentvine: active leases', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2,
      position: [740, 100], credentials: cred, executeOnce: true, onError: 'continueRegularOutput',
      retryOnFail: true, maxTries: 2, waitBetweenTries: 5000,
    },
    {
      parameters: { jsCode: buildCode },
      id: 'wf4-build', name: 'Build index (keep last good)', type: 'n8n-nodes-base.code', typeVersion: 2, position: [980, 100],
    },
    {
      parameters: {
        url: BASE + 'properties',
        authentication: 'genericCredentialType', genericAuthType: 'httpBasicAuth',
        sendQuery: true,
        queryParameters: { parameters: [{ name: 'page', value: '1' }, { name: 'pageSize', value: '1' }] },
        options: { response: { response: { fullResponse: true, neverError: true } }, timeout: 15000 },
      },
      id: 'wf4-ping', name: 'Rentvine: ping', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2,
      position: [980, 300], credentials: cred, executeOnce: true, onError: 'continueRegularOutput',
    },
    {
      parameters: { jsCode: pingCode },
      id: 'wf4-ping-result', name: 'Ping result', type: 'n8n-nodes-base.code', typeVersion: 2, position: [1220, 300],
    },
    {
      parameters: { jsCode: finishCode },
      id: 'wf4-finish', name: 'Status / cached answer', type: 'n8n-nodes-base.code', typeVersion: 2, position: [980, 480],
    },
    {
      parameters: { respondWith: 'json', responseBody: '={{ $json }}', options: {} },
      id: 'wf4-respond', name: 'Respond', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: [1460, 300],
    },
  ],
  connections: {
    'On n8n start': { main: [[{ node: 'Decide (cache + rate limits)', type: 'main', index: 0 }]] },
    'Nightly 03:17': { main: [[{ node: 'Decide (cache + rate limits)', type: 'main', index: 0 }]] },
    'Webhook (ping/status/sync)': { main: [[{ node: 'Decide (cache + rate limits)', type: 'main', index: 0 }]] },
    'Decide (cache + rate limits)': { main: [[{ node: 'Sync?', type: 'main', index: 0 }]] },
    'Sync?': { main: [
      [{ node: 'Rentvine: active leases', type: 'main', index: 0 }],
      [{ node: 'Ping?', type: 'main', index: 0 }],
    ] },
    'Ping?': { main: [
      [{ node: 'Rentvine: ping', type: 'main', index: 0 }],
      [{ node: 'Status / cached answer', type: 'main', index: 0 }],
    ] },
    'Rentvine: active leases': { main: [[{ node: 'Build index (keep last good)', type: 'main', index: 0 }]] },
    'Build index (keep last good)': { main: [[{ node: 'Respond', type: 'main', index: 0 }]] },
    'Rentvine: ping': { main: [[{ node: 'Ping result', type: 'main', index: 0 }]] },
    'Ping result': { main: [[{ node: 'Respond', type: 'main', index: 0 }]] },
    'Status / cached answer': { main: [[{ node: 'Respond', type: 'main', index: 0 }]] },
  },
  // Never store executions: Rentvine's raw rows carry tenant names and
  // balances. Only the cleaned index (no PII) is kept, in static data.
  settings: {
    executionOrder: 'v1', saveDataSuccessExecution: 'none', saveDataErrorExecution: 'none',
    saveManualExecutions: false, saveExecutionProgress: false, callerPolicy: 'workflowsFromSameOwner',
  },
};

const json = JSON.stringify(workflow, null, 2) + '\n';
if (check) {
  let cur = '';
  try { cur = readFileSync(OUT, 'utf8'); } catch (e) { /* missing */ }
  if (cur !== json) {
    console.error(`wf4:check FAILED — ${OUT} is out of date; run: node estimator/build-wf4.mjs`);
    process.exit(1);
  }
  console.log('wf4:check OK');
} else {
  writeFileSync(OUT, json);
  console.log(`wf4 OK -> ${OUT}`);
}
