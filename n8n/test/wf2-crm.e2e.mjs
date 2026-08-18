// END-TO-END: runs WF-2's real "CRM API attempt (mapped)" Code node against the
// REAL LeadSimple REST API. Not part of `npm test`: it needs a live credential
// and network, and it touches a CLIENT'S PRODUCTION CRM.
//
//   Phase A  read-only and non-persisting. Safe. Runs by default.
//   Phase B  creates real deals. Refuses to run without WGC_E2E_ALLOW_WRITES=1.
//
// Run:  node n8n/test/wf2-crm.e2e.mjs
//       WGC_E2E_ALLOW_WRITES=1 node n8n/test/wf2-crm.e2e.mjs
//
// WHY PHASE B IS GATED: DELETE /deals/{id} returns 405 Not Allowed (verified
// 2026-08-18; controls: an unrouted path 404s, and the documented
// DELETE /webhook_subscriptions/{id} 404s "not found"). There is NO API undo.
// Every deal Phase B creates must be deleted by hand in the LeadSimple UI.
// Deals in Owner Leads also auto-assign to Jon and auto-create tasks with
// next_task_kind "sms", so a careless write can trigger real outbound comms.
//
// Phase A never sends a POST that could persist: every write probe either has
// no pipeline_id or an unusable one, so LeadSimple has nowhere to put a deal.
// The rate limit is deliberately NOT exhausted: it is per ACCOUNT, shared with
// Jon's AppFolio sync and his website leads. Our 429 handling is proven against
// a stub in wf2-crm.test.mjs instead.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const WF = new URL('../workflows/wf2-delivery.json', import.meta.url);
const ENV_FILE = new URL('../../infra/.env', import.meta.url);
const BASE = 'https://api.leadsimple.com/rest';

// Verified live 2026-08-18 by reading the API, not by guessing.
const PIPELINE_ID = '8c50bfc2-6377-4174-b6b2-aa5d252fcdaa'; // Owner Leads
const STAGE_ID = 'eaa0001a-7e05-44f9-9eb6-8a711b91100c'; // New Lead
const SOURCE_NAME = 'Rent Estimator - wgcassetguide.com';

// ---------------------------------------------------------------- plumbing

function loadKey() {
  if (process.env.LEADSIMPLE_REST_KEY) return process.env.LEADSIMPLE_REST_KEY;
  try {
    const raw = readFileSync(ENV_FILE, 'utf8');
    for (const m of raw.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/gm)) {
      const name = m[1];
      const value = m[2].trim().replace(/^["']|["']$/g, '');
      if (name === 'LEADSIMPLE_REST_KEY' && value) return value;
      if (name === 'LEADSIMPLE_API_KEY' && value) return value; // verified REST-capable
    }
  } catch { /* absent */ }
  return '';
}

const KEY = loadKey();
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

function crmCode() {
  const wf = JSON.parse(readFileSync(WF, 'utf8'));
  return wf.nodes.find((n) => n.name === 'CRM API attempt (mapped)').parameters.jsCode;
}

// n8n's httpRequest helper, faithfully enough for this node: it throws on a
// non-2xx with e.response.{status,headers}, and returns {body,headers} when
// returnFullResponse is set. Getting this wrong would make the e2e a lie, so it
// is asserted against reality in Phase A test A0.
async function n8nHttpRequest(o) {
  const res = await fetch(o.url, {
    method: o.method || 'GET',
    headers: o.headers || {},
    body: o.body,
    signal: o.timeout ? AbortSignal.timeout(o.timeout) : undefined,
  });
  const text = await res.text();
  let parsed = text;
  if ((res.headers.get('content-type') || '').includes('json')) {
    try { parsed = JSON.parse(text); } catch { /* leave as text */ }
  }
  const headers = Object.fromEntries([...res.headers].map(([k, v]) => [k.toLowerCase(), v]));
  if (!res.ok) {
    const e = new Error(typeof parsed === 'object' && parsed && parsed.error ? parsed.error : 'HTTP ' + res.status);
    e.response = { status: res.status, headers, body: parsed };
    e.statusCode = res.status;
    throw e;
  }
  return o.returnFullResponse ? { statusCode: res.status, body: parsed, headers } : parsed;
}

// Executes the REAL node body with the REAL http helper.
async function runNode({ payload, estimate, env }) {
  const item = { json: Object.assign({ payload }, estimate ? { estimate } : {}) };
  const fn = new AsyncFunction('$input', 'require', '$env', crmCode());
  const noRequire = (m) => { throw new Error('node must not require("' + m + '")'); };
  const out = await fn.call({ helpers: { httpRequest: n8nHttpRequest } }, { all: () => [item] }, noRequire, env);
  return out[0].json;
}

const FULL_ENV = {
  LEADSIMPLE_REST_KEY: KEY,
  LEADSIMPLE_PIPELINE_ID: PIPELINE_ID,
  LEADSIMPLE_STAGE_ID: STAGE_ID,
  LEADSIMPLE_SOURCE_NAME: SOURCE_NAME,
};

const lead = (over = {}) => Object.assign({
  submission_id: 'e2e-' + Date.now().toString(36),
  name: '', email: '', phone: '', zip: '76052', sqft: 1800, bedrooms: 3, ebook_opt_in: true,
}, over);

// PHASE A only. A reserved TLD (RFC 2606) that cannot receive mail. Phase A
// never persists a deal, so nothing can be triggered against it either way.
const safeEmail = (tag) => `wgc-e2e-${tag}-${Date.now().toString(36)}@example.invalid`;

// PHASE B. A mailbox WE control, deliberately, not an unreachable address.
// Creating a deal in Owner Leads fires automated outbound mail: 3 of the 8 most
// recent deals were emailed within 4s, 1s and 2s of creation (checked
// 2026-08-18). Pointing that at a real inbox turns an unavoidable side effect
// into the only record anybody has of what Jon's account sends a new lead.
// Plus-addressed so repeat runs do not collide with LeadSimple's own dedupe.
function realEmail(tag) {
  const base = process.env.WGC_E2E_EMAIL || 'yousseff+wgce2e@westromgroup.com';
  const at = base.indexOf('@');
  if (at < 1) throw new Error('WGC_E2E_EMAIL is not an email address');
  const local = base.slice(0, at);
  const domain = base.slice(at);
  const uniq = `${tag}-${Date.now().toString(36)}`;
  return local.includes('+') ? `${local}-${uniq}${domain}` : `${local}+wgce2e-${uniq}${domain}`;
}

let pass = 0; let fail = 0; const notes = [];
async function check(name, fn) {
  try { await fn(); pass++; console.log('  PASS  ' + name); }
  catch (e) { fail++; console.log('  FAIL  ' + name + '\n          ' + String(e.message).split('\n')[0]); }
}
const note = (s) => { notes.push(s); console.log('  ..    ' + s); };

// ============================================================== PHASE A
console.log('\n=== PHASE A: read-only and non-persisting (safe) ===\n');

if (!KEY) {
  console.log('  SKIP  no credential found (infra/.env or LEADSIMPLE_REST_KEY). Nothing ran.');
  process.exit(0);
}

await check('A0  the http stub matches reality: a 401 really does throw with .response.status', async () => {
  let caught = null;
  try { await n8nHttpRequest({ method: 'GET', url: BASE + '/info/account', headers: { Authorization: 'not-a-key' } }); }
  catch (e) { caught = e; }
  assert.ok(caught, 'a 401 must throw, or the node never sees failures');
  assert.equal(caught.response.status, 401);
  assert.ok(caught.response.headers, 'headers must be reachable for retry-after');
});

await check('A1  the credential authenticates and names the right account', async () => {
  const r = await n8nHttpRequest({ method: 'GET', url: BASE + '/info/account', headers: { Authorization: KEY }, returnFullResponse: true });
  assert.equal(r.statusCode, 200);
  assert.match(r.body.data.name, /Westrom/i);
});

// Deliberately frugal. The first run of this file fetched stages with
// per_page=200 and tripped "Rate limit exceeded for records" on a limit that is
// shared with the client's AppFolio sync and their real website leads. The
// expensive metric on this API is RECORDS RETURNED, not requests: 1000 records
// vs 100 requests per minute. So fetch the two ids by their single-item
// endpoints, 2 records instead of ~30.
await check('A2  the target pipeline and stage ids are real, not stale (2 records)', async () => {
  const p = await n8nHttpRequest({ method: 'GET', url: BASE + '/pipelines/' + PIPELINE_ID, headers: { Authorization: KEY } });
  const one = Array.isArray(p.data) ? p.data[0] : p.data;
  assert.equal(one.id, PIPELINE_ID);
  assert.equal(one.name, 'Owner Leads');
  const s = await n8nHttpRequest({ method: 'GET', url: `${BASE}/pipelines/${PIPELINE_ID}/stages/${STAGE_ID}`, headers: { Authorization: KEY } });
  const stage = Array.isArray(s.data) ? s.data[0] : s.data;
  assert.equal(stage.id, STAGE_ID);
  assert.equal(stage.name, 'New Lead');
  assert.equal(stage.status, 'active');
});

await check('A3  the node REPORTS a bad credential instead of swallowing it', async () => {
  const j = await runNode({ payload: lead({ email: safeEmail('badkey') }), env: { ...FULL_ENV, LEADSIMPLE_REST_KEY: 'not-a-key' } });
  assert.equal(j.delivered_api, false);
  assert.match(j.crm_error, /HTTP 401/);
  assert.match(j.crm_error, /Invalid Access Token/i, 'carries the API\'s own words, not ours');
  assert.equal(j.crm_deal_id, '');
});

await check('A4  the node REPORTS a missing credential without making a call', async () => {
  const j = await runNode({ payload: lead({ email: safeEmail('noconf') }), env: {} });
  assert.equal(j.delivered_api, false);
  // The credential is now the ONLY thing that can be missing: pipeline, stage
  // and source ship as verified defaults so that fixing lead delivery needs no
  // new Railway variable, and therefore no worker redeploy, and therefore does
  // not wipe the estimator index.
  assert.match(j.crm_error, /LEADSIMPLE_REST_KEY/);
  assert.match(j.crm_error, /LEADSIMPLE_API_KEY/, 'names the variable Railway already has');
  assert.doesNotMatch(j.crm_error, /LEADSIMPLE_PIPELINE_ID/, 'the pipeline has a default, so it is never missing');
});

await check('A5  a nonexistent pipeline is rejected and reported (nothing can persist)', async () => {
  const j = await runNode({
    payload: lead({ email: safeEmail('badpipe') }),
    env: { ...FULL_ENV, LEADSIMPLE_PIPELINE_ID: '00000000-0000-4000-8000-000000000000' },
  });
  assert.equal(j.delivered_api, false);
  assert.notEqual(j.crm_error, '');
  note('bad pipeline_id -> ' + j.crm_error.slice(0, 150));
});

await check('A6  a malformed (non-uuid) pipeline id is rejected, not 500', async () => {
  const j = await runNode({
    payload: lead({ email: safeEmail('malformed') }),
    env: { ...FULL_ENV, LEADSIMPLE_PIPELINE_ID: 'not-a-uuid-at-all' },
  });
  assert.equal(j.delivered_api, false);
  assert.doesNotMatch(j.crm_error, /HTTP 5\d\d/, 'a malformed id must not crash their API');
  note('malformed pipeline_id -> ' + j.crm_error.slice(0, 200));
});

// The regression guard for what the FIRST run of this file caught: the live 400
// body is an array of objects and rendered as "[object Object],[object Object]",
// which would have been the whole content of the alert email.
await check('A6b the REAL 400 body is legible in crm_error, not [object Object]', async () => {
  const j = await runNode({
    payload: lead({ email: safeEmail('legible') }),
    env: { ...FULL_ENV, LEADSIMPLE_PIPELINE_ID: '00000000-0000-4000-8000-000000000000' },
  });
  assert.doesNotMatch(j.crm_error, /\[object Object\]/, 'an unreadable alarm is barely better than none');
  assert.match(j.crm_error, /HTTP 400/);
  note('legible 400 -> ' + j.crm_error.slice(0, 220));
});

// A permanent error must not be retried: it cannot succeed, it delays the alert
// by 10s, and the quota it burns is shared with the client's other integrations.
await check('A6c a permanent 4xx is attempted ONCE against the real API', async () => {
  const before = Date.now();
  const j = await runNode({
    payload: lead({ email: safeEmail('noretry') }),
    env: { ...FULL_ENV, LEADSIMPLE_PIPELINE_ID: 'not-a-uuid-at-all' },
  });
  const elapsed = Date.now() - before;
  assert.match(j.crm_error, /\[permanent, not retried\]/);
  assert.ok(elapsed < 8000, 'must not sit through the 2s+8s ladder; took ' + elapsed + 'ms');
  note(`permanent 4xx returned in ${elapsed}ms (old behaviour: ~10000ms and 3 API calls)`);
});

await check('A7  how the API answers a POST with NO required field (undocumented: no 400 in the spec)', async () => {
  let status = 'no error thrown';
  let body = '';
  try {
    await n8nHttpRequest({
      method: 'POST', url: BASE + '/deals',
      headers: { Authorization: KEY, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'deal[name]=wgc-e2e-no-pipeline', returnFullResponse: true,
    });
  } catch (e) { status = e.response.status; body = JSON.stringify(e.response.body).slice(0, 300); }
  note(`POST /deals with no pipeline_id -> ${status}  ${body}`);
  assert.notEqual(status, 'no error thrown', 'a deal with no pipeline must NOT be accepted');
});

await check('A8  read-back by email works, which is what makes delivery provable', async () => {
  const r = await n8nHttpRequest({
    method: 'GET',
    url: `${BASE}/deals?pipeline_id=${PIPELINE_ID}&search=${encodeURIComponent('nobody-here-' + Date.now() + '@example.invalid')}`,
    headers: { Authorization: KEY },
  });
  assert.ok(Array.isArray(r.data), 'search returns a data array');
  assert.equal(r.data.length, 0, 'an unknown email finds nothing, so a hit later means something');
});

await check('A9  a timeout aborts rather than hanging the workflow forever', async () => {
  let caught = null;
  try { await n8nHttpRequest({ method: 'GET', url: BASE + '/info/account', headers: { Authorization: KEY }, timeout: 1 }); }
  catch (e) { caught = e; }
  assert.ok(caught, '1ms must abort');
  assert.match(String(caught.name + ' ' + caught.message), /abort|timeout/i);
});

await check('A10 rate-limit headers are present and named as our backoff expects', async () => {
  const r = await n8nHttpRequest({ method: 'GET', url: BASE + '/info/account', headers: { Authorization: KEY }, returnFullResponse: true });
  assert.ok('x-ratelimit-metric-requests-limit' in r.headers, 'limit header present');
  note(`quota now: ${r.headers['x-ratelimit-metric-requests-count']}/${r.headers['x-ratelimit-metric-requests-limit']} requests, `
    + `${r.headers['x-ratelimit-metric-records-count']}/${r.headers['x-ratelimit-metric-records-limit']} records per minute (per ACCOUNT)`);
});

// ============================================================== PHASE B
console.log('\n=== PHASE B: creates real deals in a live client CRM ===\n');

if (process.env.WGC_E2E_ALLOW_WRITES !== '1') {
  console.log('  SKIP  set WGC_E2E_ALLOW_WRITES=1 to run. There is no API delete (405),');
  console.log('        so anything created here must be removed by hand in LeadSimple.');
} else {
  const createdIds = [];
  const email = realEmail('happy');
  console.log('  ..    contact email for this run: ' + email);

  // Deliberately the MINIMUM env: one credential, under the LEGACY name Railway
  // already holds. No LEADSIMPLE_REST_KEY, no pipeline, no stage, no source.
  // This is exactly the production state after an import+publish with nothing
  // configured, so passing here means the workflow works with zero new Railway
  // variables, and therefore with no worker redeploy and no wiped estimator index.
  const ZERO_CONFIG_ENV = { LEADSIMPLE_API_KEY: KEY };

  await check('B1  ZERO new config: one legacy key creates a real deal, id + link back', async () => {
    const j = await runNode({
      payload: lead({ email }),
      estimate: { low: 1800, high: 2000, comps: [], meta: { source: 'own-lease-history' } },
      env: ZERO_CONFIG_ENV,
    });
    assert.equal(j.delivered_api, true, 'crm_error was: ' + j.crm_error);
    assert.ok(j.crm_deal_id, 'must return data.id');
    assert.match(j.crm_key_source, /LEADSIMPLE_API_KEY/, 'and it says which variable answered');
    createdIds.push(j.crm_deal_id);
    note('key source: ' + j.crm_key_source + '   pipeline used: ' + j.crm_pipeline_id);
    note('created deal ' + j.crm_deal_id);
    note('PROOF LINK ' + (j.crm_deal_link || '(none returned)'));
  });

  // The READ shape is NOT the WRITE shape. Verified live 2026-08-18: we send
  // property[address_zip_code] / [square_feet] / [num_bedrooms] /
  // [estimated_rent], and the deal comes back with zip_code on the property and
  // the rest nested under property.unit. The first version of this check read
  // the write-side names, got {} for everything, and reported a data-loss bug
  // that did not exist. Asserting the wrong keys is worse than not asserting.
  await check('B2  every field we sent is really on the deal (read-side names)', async () => {
    assert.ok(createdIds[0], 'B1 must have created one');
    const r = await n8nHttpRequest({ method: 'GET', url: `${BASE}/deals/${createdIds[0]}`, headers: { Authorization: KEY } });
    const d = Array.isArray(r.data) ? r.data[0] : r.data;
    const c = (d.contacts || [])[0] || {};
    const p = (d.properties || [])[0] || {};
    const u = p.unit || {};
    note(`deal.name=${JSON.stringify(d.name)} source=${JSON.stringify(d.source && d.source.name)} stage=${JSON.stringify(d.stage && d.stage.name)}`);
    note(`contact.name=${JSON.stringify(c.name)} emails=${JSON.stringify(c.emails)}`);
    note(`property.zip_code=${JSON.stringify(p.zip_code)} unit.square_feet=${JSON.stringify(u.square_feet)} `
      + `unit.num_bedrooms=${JSON.stringify(u.num_bedrooms)} unit.estimated_rent=${JSON.stringify(u.estimated_rent)}`);
    note(`assignee=${JSON.stringify(d.assignee && d.assignee.name)} next_task=${JSON.stringify(d.next_task_kind)}`);

    assert.equal(d.name, email.split('@')[0], 'deal title is the email local-part');
    assert.equal(d.source && d.source.name, SOURCE_NAME, 'our dedicated source');
    assert.equal(d.stage && d.stage.name, 'New Lead');
    assert.deepEqual(c.emails, [email], 'the contact carries the email');
    // LeadSimple normalises full_name: it title-cases and splits on separators,
    // so "jsmith-happy" comes back "Jsmith Happy". Asserting equality here was
    // MY error, not theirs. What matters is that it is derived from what we
    // sent and is no longer the invented "Unknown Name".
    assert.notEqual(c.name, 'Unknown Name', 'contact[full_name] must stop LeadSimple inventing a name');
    const localPart = email.split('@')[0];
    const squash = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
    assert.equal(squash(c.name), squash(localPart), `contact name derives from the local-part; got ${JSON.stringify(c.name)}`);
    assert.equal(p.zip_code, '76052', 'zip landed');
    assert.equal(Number(u.square_feet), 1800, 'square footage landed');
    assert.equal(Number(u.num_bedrooms), 3, 'bedrooms landed');
    assert.equal(Number(u.estimated_rent), 1900, 'OUR rent midpoint landed on the client property record');
    assert.match(String(d.comments), /Submission: /, 'submission id is traceable in comments');
  });

  // THE test the duplicate guard stands on. The guard runs ~2 seconds after a
  // failed write, so whatever it reads must be consistent IMMEDIATELY. This
  // measures that, and measures search alongside it for the record.
  await check('B3  the LISTING sees a brand-new deal immediately (search does not)', async () => {
    const localPart = email.split('@')[0];
    const listing = await n8nHttpRequest({
      method: 'GET',
      url: `${BASE}/pipelines/${PIPELINE_ID}/deals?per_page=25&order_field=created_at&order_direction=desc`,
      headers: { Authorization: KEY },
    });
    const inListing = listing.data.some((x) => x.id === createdIds[0]);
    const byName = await n8nHttpRequest({
      method: 'GET', url: `${BASE}/deals?pipeline_id=${PIPELINE_ID}&search=${encodeURIComponent(localPart)}`,
      headers: { Authorization: KEY },
    });
    const byEmail = await n8nHttpRequest({
      method: 'GET', url: `${BASE}/deals?pipeline_id=${PIPELINE_ID}&search=${encodeURIComponent(email)}`,
      headers: { Authorization: KEY },
    });
    note(`immediately after create: listing=${inListing ? 'FOUND' : 'missing'}  `
      + `search(name)=${byName.data.length} hit(s)  search(full email)=${byEmail.data.length} hit(s)`);
    if (!byName.data.length) note('search lag confirmed again: the index had not caught up yet');
    assert.ok(inListing, 'the guard reads this listing; if it lags, the guard is useless');
  });

  // NOT re-tested here on purpose. Creating another duplicate would leave a
  // second undeletable deal in the client's pipeline to prove something already
  // proven: on 2026-08-18 two POSTs with the same email produced deals
  // db4f8e27 and 60e5a983 one second apart, sharing ONE contact (4369952e) but
  // with two separate property and unit records. So deal[accept_duplicates]
  // =false dedupes the contact, NOT the deal. Our own retry guard is covered by
  // unit tests in wf2-crm.test.mjs, which cost nobody a cleanup task.
  note('duplicate behaviour: verified 2026-08-18, not re-created here (see wf2-crm.test.mjs)');

  await check('B5  the dedicated Source was auto-created by create_source_if_new', async () => {
    const r = await n8nHttpRequest({
      method: 'GET', url: `${BASE}/pipelines/${PIPELINE_ID}/sources?per_page=50`,
      headers: { Authorization: KEY },
    });
    const ours = r.data.find((s) => s.name === SOURCE_NAME);
    assert.ok(ours, `"${SOURCE_NAME}" must now exist in Owner Leads; got: ${r.data.map((s) => s.name).join(' | ')}`);
    note('source created: ' + ours.name + '  id=' + ours.id);
  });

  // The reason for using a real mailbox. Answers, with evidence, what Jon's
  // account does to a lead the instant it arrives. Nobody had verified this.
  await check('B6  observe whether automated outbound mail fires on our deal', async () => {
    assert.ok(createdIds[0], 'B1 must have created one');
    await new Promise((r) => setTimeout(r, 20000)); // real deals were emailed within 1-4s
    const r = await n8nHttpRequest({ method: 'GET', url: `${BASE}/deals/${createdIds[0]}`, headers: { Authorization: KEY } });
    const d = Array.isArray(r.data) ? r.data[0] : r.data;
    const lag = d.last_emailed_at ? Math.round((new Date(d.last_emailed_at) - new Date(d.created_at)) / 1000) : null;
    note(`automation after 20s: outbound_emails=${d.num_outbound_emails} last_emailed_at=${d.last_emailed_at || 'never'}`
      + (lag === null ? '' : ` (+${lag}s)`) + ` next_task=${d.next_task_kind || 'none'} due=${d.next_task_due_at || 'none'}`);
    note(lag !== null
      ? 'CONFIRMED: Jon\'s account emails a new lead automatically. Check ' + email + ' for what it says.'
      : 'No automated email fired on OUR deal within 20s. The 3-of-8 pattern is conditional, not universal.');
  });

  console.log('\n  ############################################################');
  console.log('  MANUAL CLEANUP REQUIRED. There is no API delete (405).');
  for (const id of createdIds) console.log('    delete deal ' + id);
  console.log('  Owner Leads pipeline. Search for: ' + email);
  console.log('  Also clear any task queued for Jon on those deals.');
  console.log('  ############################################################');
}

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
if (notes.length) {
  console.log('\nObserved behaviour worth recording:');
  for (const n of notes) console.log('  - ' + n);
}
process.exit(fail ? 1 : 0);
