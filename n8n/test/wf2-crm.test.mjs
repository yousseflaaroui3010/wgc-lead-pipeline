// Executes WF-2's "CRM API attempt (mapped)" Code node the way n8n runs it and
// proves the LeadSimple REST delivery contract.
//
// Why this file exists at all: before it, NOTHING in the gate ever parsed or
// ran WF-2's Code nodes. They live as strings inside a JSON document, so the
// `node --check` sweep (widget|estimator */src/*) never saw them and no test
// imported them. That blind spot is why an adapter reading a file which could
// not exist on Railway sat in production for four weeks reporting success.
// A check that never executes is untested, not passing.
//
// Run: node --test n8n/test/wf2-crm.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const WF = new URL('../workflows/wf2-delivery.json', import.meta.url);

const loadWf = () => JSON.parse(readFileSync(WF, 'utf8'));

function crmCode() {
  const node = loadWf().nodes.find((n) => n.name === 'CRM API attempt (mapped)');
  assert.ok(node, 'CRM API attempt (mapped) must exist in WF-2');
  assert.equal(node.parameters.mode, 'runOnceForAllItems', 'node body uses $input.all()');
  return node.parameters.jsCode;
}

// n8n wraps a Code node body in an async function with $input, require and $env
// in scope, and binds `this` to a context carrying helpers.
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

// Pass `delays` to collect the backoff waits instead of sitting through them.
// Retries are 2s/8s, so without this the suite would spend 20 seconds asleep.
// One test below deliberately uses REAL timers, so the fact that the node
// actually waits is still proven by execution rather than assumed.
async function runCrm({ payload, estimate, env = {}, httpRequest, delays } = {}) {
  const item = { json: Object.assign({ payload }, estimate ? { estimate } : {}) };
  const $input = { all: () => [item] };
  const fn = new AsyncFunction('$input', 'require', '$env', crmCode());
  const ctx = { helpers: { httpRequest: httpRequest || (async () => { throw new Error('no http stub'); }) } };
  // The node must not touch the filesystem or any builtin. A require that
  // throws proves that, rather than us merely believing it.
  const noRequire = (mod) => { throw new Error('unexpected require("' + mod + '")'); };
  const realSetTimeout = globalThis.setTimeout;
  if (delays) globalThis.setTimeout = (cb, ms) => { delays.push(ms); return realSetTimeout(cb, 0); };
  try {
    const out = await fn.call(ctx, $input, noRequire, env);
    assert.ok(Array.isArray(out) && out.length === 1, 'returns a single-item array');
    return out[0].json;
  } finally {
    globalThis.setTimeout = realSetTimeout;
  }
}

const LEAD = {
  submission_id: 'sub-0001',
  name: '',
  email: 'jsmith@gmail.com',
  phone: '',
  zip: '76052',
  sqft: 1800,
  bedrooms: 3,
  ebook_opt_in: true,
};

const FULL_ENV = {
  LEADSIMPLE_REST_KEY: 'test-key',
  LEADSIMPLE_PIPELINE_ID: '8c50bfc2-6377-4174-b6b2-aa5d252fcdaa',
  LEADSIMPLE_STAGE_ID: 'eaa0001a-7e05-44f9-9eb6-8a711b91100c',
  LEADSIMPLE_SOURCE_NAME: 'Rent Estimator - wgcassetguide.com',
};

const created = (id = 'deal-1', link = 'https://app.leadsimple.com/v2/pipelines/x/deals/y') =>
  async () => ({ statusCode: 201, body: { data: { id, link } } });

// Parse an x-www-form-urlencoded body into repeatable pairs.
function pairs(body) {
  return body.split('&').map((kv) => {
    const i = kv.indexOf('=');
    return [decodeURIComponent(kv.slice(0, i)), decodeURIComponent(kv.slice(i + 1))];
  });
}
const pick = (body, key) => pairs(body).filter(([k]) => k === key).map(([, v]) => v);

// --- the exact bug, proven by deliberate violation -------------------------

test('absent config is REPORTED, not swallowed (the four-week silent failure)', async () => {
  let called = 0;
  const j = await runCrm({ payload: LEAD, env: {}, httpRequest: async () => { called++; } });
  assert.equal(called, 0, 'must not attempt a call it cannot authenticate');
  assert.equal(j.delivered_api, false);
  assert.match(j.crm_error, /LEADSIMPLE_REST_KEY/, 'names the missing key');
  assert.match(j.crm_error, /LEADSIMPLE_PIPELINE_ID/, 'names the missing pipeline');
  assert.match(j.crm_error, /both the n8n main and worker/i, 'says where to set them');
  assert.notEqual(j.crm_error, '', 'a non-empty reason is what drives the alert');
});

test('partial config still reports, naming only what is missing', async () => {
  const j = await runCrm({
    payload: LEAD,
    env: { LEADSIMPLE_REST_KEY: 'k' },
    httpRequest: async () => { throw new Error('should not be called'); },
  });
  assert.equal(j.delivered_api, false);
  assert.match(j.crm_error, /LEADSIMPLE_PIPELINE_ID/);
  assert.doesNotMatch(j.crm_error, /LEADSIMPLE_REST_KEY/, 'does not blame what is present');
});

// --- the delivery contract, verified live 2026-08-18 -----------------------

test('happy path posts form-encoded to /deals and returns the deal id + link', async () => {
  let seen = null;
  const j = await runCrm({
    payload: LEAD,
    env: FULL_ENV,
    httpRequest: async (o) => { seen = o; return { statusCode: 201, body: { data: { id: 'deal-9', link: 'https://app.leadsimple.com/deal-9' } } }; },
  });
  assert.equal(seen.method, 'POST');
  assert.equal(seen.url, 'https://api.leadsimple.com/rest/deals');
  assert.equal(seen.headers['Content-Type'], 'application/x-www-form-urlencoded');
  assert.equal(seen.headers.Authorization, 'test-key', 'raw key, no Bearer prefix');
  assert.equal(typeof seen.body, 'string', 'form-encoded, NOT json');
  assert.equal(j.delivered_api, true);
  assert.equal(j.crm_error, '');
  assert.equal(j.crm_deal_id, 'deal-9');
  assert.equal(j.crm_deal_link, 'https://app.leadsimple.com/deal-9');
});

test('body carries LeadSimple field names, not our internal ones', async () => {
  let body = '';
  await runCrm({ payload: LEAD, env: FULL_ENV, httpRequest: async (o) => { body = o.body; return (await created()()); } });
  assert.deepEqual(pick(body, 'deal[pipeline_id]'), [FULL_ENV.LEADSIMPLE_PIPELINE_ID]);
  assert.deepEqual(pick(body, 'deal[stage_id]'), [FULL_ENV.LEADSIMPLE_STAGE_ID]);
  assert.deepEqual(pick(body, 'deal[source_id_or_name]'), [FULL_ENV.LEADSIMPLE_SOURCE_NAME]);
  assert.deepEqual(pick(body, 'deal[create_source_if_new]'), ['true']);
  assert.deepEqual(pick(body, 'deal[accept_duplicates]'), ['false'], 'let LeadSimple dedupe');
  assert.deepEqual(pick(body, 'contact[email_addresses][]'), ['jsmith@gmail.com']);
  assert.deepEqual(pick(body, 'property[address_zip_code]'), ['76052']);
  assert.deepEqual(pick(body, 'property[square_feet]'), ['1800']);
  assert.deepEqual(pick(body, 'property[num_bedrooms]'), ['3']);
  // Our own vocabulary must not leak into their API.
  for (const ours of ['sqft', 'bedrooms', 'zip', 'ebook_opt_in', 'submission_id']) {
    assert.equal(pick(body, ours).length, 0, ours + ' is not a LeadSimple field');
  }
});

test('deal title is the email local-part, with a zip fallback', async () => {
  let body = '';
  const http = async (o) => { body = o.body; return (await created()()); };
  const withEmail = await runCrm({ payload: LEAD, env: FULL_ENV, httpRequest: http });
  assert.deepEqual(pick(body, 'deal[name]'), ['jsmith']);
  assert.equal(withEmail.lead_name, 'jsmith');

  const noEmail = await runCrm({ payload: { ...LEAD, email: '' }, env: FULL_ENV, httpRequest: http });
  assert.deepEqual(pick(body, 'deal[name]'), ['Rent estimate - 76052']);
  assert.equal(noEmail.lead_name, 'Rent estimate - 76052');
  assert.equal(pick(body, 'contact[email_addresses][]').length, 0, 'no blank email sent');
});

test('the rent estimate rides along as property[estimated_rent] (midpoint)', async () => {
  let body = '';
  await runCrm({
    payload: LEAD,
    estimate: { low: 1800, high: 2000, comps: [], meta: { source: 'own-lease-history' } },
    env: FULL_ENV,
    httpRequest: async (o) => { body = o.body; return (await created()()); },
  });
  assert.deepEqual(pick(body, 'property[estimated_rent]'), ['1900']);
  assert.match(pick(body, 'deal[comments]')[0], /Estimate shown: \$1,800 to \$2,000/);
  assert.match(pick(body, 'deal[comments]')[0], /own-lease-history/);
  assert.match(pick(body, 'deal[comments]')[0], /sub-0001/, 'submission id is the only thread back');
});

test('no estimate -> no estimated_rent field, lead still delivered', async () => {
  let body = '';
  const j = await runCrm({ payload: LEAD, env: FULL_ENV, httpRequest: async (o) => { body = o.body; return (await created()()); } });
  assert.equal(pick(body, 'property[estimated_rent]').length, 0);
  assert.equal(j.delivered_api, true);
});

test('phone is wired for the day the form collects one, and omitted until then', async () => {
  let body = '';
  const http = async (o) => { body = o.body; return (await created()()); };
  await runCrm({ payload: LEAD, env: FULL_ENV, httpRequest: http });
  assert.equal(pick(body, 'contact[phone_numbers][][phone]').length, 0, 'blank phone omitted');

  await runCrm({ payload: { ...LEAD, phone: '+18175551234' }, env: FULL_ENV, httpRequest: http });
  assert.deepEqual(pick(body, 'contact[phone_numbers][][kind]'), ['mobile']);
  assert.deepEqual(pick(body, 'contact[phone_numbers][][phone]'), ['+18175551234']);
});

// --- refusing to claim delivery we did not confirm -------------------------

test('a 2xx carrying no data.id is NOT delivery', async () => {
  const delays = [];
  const j = await runCrm({
    payload: LEAD,
    env: FULL_ENV,
    delays,
    httpRequest: async () => ({ statusCode: 200, body: { data: {} } }),
  });
  assert.equal(j.delivered_api, false, 'no id means no proof a deal exists');
  assert.match(j.crm_error, /data\.id/);
});

test('a string response body is parsed, not assumed to be an object', async () => {
  const j = await runCrm({
    payload: LEAD,
    env: FULL_ENV,
    httpRequest: async () => ({ statusCode: 201, body: JSON.stringify({ data: { id: 'deal-s', link: 'L' } }) }),
  });
  assert.equal(j.delivered_api, true);
  assert.equal(j.crm_deal_id, 'deal-s');
});

test('401 exhausts retries on the documented backoff, without claiming delivery', async () => {
  let calls = 0;
  const delays = [];
  const j = await runCrm({
    payload: LEAD,
    env: FULL_ENV,
    delays,
    httpRequest: async () => {
      calls++;
      const e = new Error('Invalid Access Token');
      e.response = { status: 401, headers: {} };
      throw e;
    },
  });
  assert.equal(calls, 3, 'three attempts');
  assert.deepEqual(delays, [2000, 8000], 'backs off 2s then 8s, and does not sleep after the last try');
  assert.equal(j.delivered_api, false);
  assert.match(j.crm_error, /HTTP 401/);
  assert.equal(j.crm_deal_id, '');
});

test('a transient failure then success = delivered', async () => {
  let calls = 0;
  const delays = [];
  const j = await runCrm({
    payload: LEAD,
    env: FULL_ENV,
    delays,
    httpRequest: async () => {
      calls++;
      if (calls === 1) { const e = new Error('ECONNRESET'); e.response = { status: 502, headers: {} }; throw e; }
      return { statusCode: 201, body: { data: { id: 'deal-r', link: 'L' } } };
    },
  });
  assert.equal(calls, 2);
  assert.deepEqual(delays, [2000]);
  assert.equal(j.delivered_api, true);
  assert.equal(j.crm_error, '', 'a recovered error must not leave a stale reason behind');
  assert.equal(j.crm_deal_id, 'deal-r');
});

// Deliberately uses REAL timers (no `delays`), so that the node genuinely
// sleeping is proven by execution once, not merely inferred from every other
// test's captured numbers. Costs ~1s, which is worth paying exactly once.
test('rate limiting honours the server X-RateLimit-Retry-After over our backoff', async () => {
  let calls = 0;
  const started = Date.now();
  const j = await runCrm({
    payload: LEAD,
    env: FULL_ENV,
    httpRequest: async () => {
      calls++;
      if (calls === 1) {
        const e = new Error('rate limited');
        // 1s from the server beats our 2s first backoff step.
        e.response = { status: 429, headers: { 'x-ratelimit-retry-after': '1' } };
        throw e;
      }
      return { statusCode: 201, body: { data: { id: 'deal-429', link: 'L' } } };
    },
  });
  const waited = Date.now() - started;
  assert.equal(j.delivered_api, true);
  assert.ok(waited >= 900, 'waited the server-instructed second, got ' + waited + 'ms');
  assert.ok(waited < 1900, 'did not fall back to the 2s step, got ' + waited + 'ms');
});

// --- the fallback email, and the wiring that surfaces failure --------------

test('fallback parse email uses LeadSimple documented labels and a populated Name', async () => {
  const j = await runCrm({ payload: LEAD, env: FULL_ENV, httpRequest: created() });
  const lines = j.email_text.split('\n');
  assert.equal(lines[0], 'Name: jsmith', 'never a bare "Name:" again');
  assert.equal(lines[1], 'Email: jsmith@gmail.com');
  assert.ok(lines.some((l) => l.startsWith('Phone Number: ')), 'their label, not our "Phone"');
  assert.ok(lines.some((l) => l.startsWith('Zip Code: ')), 'their label, not our "Zip"');
  // Labels LeadSimple does not document must not appear as bare field labels.
  for (const invented of ['Square Footage:', 'Bedrooms:', 'Ebook Requested:']) {
    assert.ok(!lines.some((l) => l.startsWith(invented)), invented + ' moved into Comments');
  }
  assert.ok(j.email_text.includes('Comments: '), 'extras ride in Comments');
});

test('a CRM failure fans out to BOTH the fallback and an alert', () => {
  const wf = loadWf();
  const branch = wf.connections['API failed or disabled?'].main[0].map((x) => x.node);
  assert.ok(branch.includes('Fallback: email-parse path'), 'lead still goes somewhere');
  assert.ok(branch.includes('Alert: CRM delivery failed'), 'and a human is told');
  const alert = wf.nodes.find((n) => n.name === 'Alert: CRM delivery failed');
  assert.ok(alert, 'alert node exists');
  assert.match(alert.parameters.jsonBody, /ALERT_EMAIL/);
  assert.match(alert.parameters.jsonBody, /crm_error/, 'the alert carries the reason');
});

test('the parse send no longer swallows its own failure', () => {
  const parse = loadWf().nodes.find((n) => n.name === 'Fallback: email-parse path');
  assert.notEqual(
    parse.onError,
    'continueRegularOutput',
    'onError:continueRegularOutput let a rejected Brevo send still reach "Mark delivered"',
  );
});

test('the notification tells the truth about which path delivered', () => {
  const notify = loadWf().nodes.find((n) => n.name === 'Notify Jon + Ashley + Youssef');
  assert.match(notify.parameters.jsonBody, /crm_deal_link/, 'links straight to the deal');
  assert.match(notify.parameters.jsonBody, /may NOT exist in LeadSimple/, 'says so when unproven');
  assert.match(notify.parameters.jsonBody, /crm_error/);
});

test('no runtime read of the phantom bind-mount path survives in executable code', () => {
  const code = crmCode();
  const executable = code
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');
  assert.ok(
    !executable.includes('leadsimple-map.json'),
    'the file path may only be referenced in the comment that explains the history',
  );
  assert.ok(!/require\(['"]fs['"]\)/.test(executable), 'no filesystem dependency at all');
});
