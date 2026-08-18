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
  // Without this, LeadSimple invents the contact name "Unknown Name". Observed
  // live 2026-08-18 on a real created deal.
  assert.deepEqual(pick(body, 'contact[full_name]'), ['jsmith'], 'contact must not be nameless');
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

// --- retry policy: only transient failures are worth a second attempt -----
// The live e2e showed the old loop retrying a 400 three times. That delays the
// alert by 10s and spends account-wide quota (shared with the client's other
// integrations) to learn nothing, because the request is malformed either way.

const throws = (status, body, headers = {}) => async () => {
  const e = new Error(typeof body === 'string' ? body : 'HTTP ' + status);
  e.response = { status, headers, body };
  e.statusCode = status;
  throw e;
};

for (const [status, label] of [[400, 'validation'], [401, 'bad credential'], [403, 'forbidden'], [404, 'no such pipeline']]) {
  test(`a ${status} (${label}) is tried ONCE and marked permanent`, async () => {
    let calls = 0;
    const delays = [];
    const j = await runCrm({
      payload: LEAD,
      env: FULL_ENV,
      delays,
      httpRequest: async (o) => { calls++; return throws(status, { error: label })(o); },
    });
    assert.equal(calls, 1, 'no point asking again');
    assert.deepEqual(delays, [], 'and no sleeping');
    assert.equal(j.delivered_api, false);
    assert.match(j.crm_error, new RegExp('HTTP ' + status));
    assert.match(j.crm_error, /\[permanent, not retried\]/);
    assert.equal(j.crm_deal_id, '');
  });
}

for (const [status, label] of [[429, 'rate limited'], [500, 'server error'], [503, 'unavailable'], [408, 'request timeout']]) {
  test(`a ${status} (${label}) IS retried on the backoff ladder`, async () => {
    let posts = 0;
    const delays = [];
    const j = await runCrm({
      payload: LEAD,
      env: FULL_ENV,
      delays,
      httpRequest: async (o) => {
        if (o.method === 'POST') posts++;
        return throws(status, { error: label })(o);
      },
    });
    assert.equal(posts, 3, 'three POST attempts');
    assert.deepEqual(delays, [2000, 8000], 'backs off 2s then 8s, no sleep after the last try');
    assert.equal(j.delivered_api, false);
    assert.doesNotMatch(j.crm_error, /permanent/);
  });
}

test('a transport error with no HTTP status is treated as transient', async () => {
  const delays = [];
  await runCrm({
    payload: LEAD,
    env: FULL_ENV,
    delays,
    httpRequest: async () => { throw new Error('ECONNRESET'); },
  });
  assert.deepEqual(delays, [2000, 8000], 'a dropped connection deserves a retry');
});

// --- never create a duplicate lead on an ambiguous retry ------------------
// Verified live 2026-08-18: deal[accept_duplicates]=false does NOT dedupe. Two
// POSTs with the same email produced two deals one second apart, and the API
// has no idempotency key. So a timeout or 5xx after a successful write would
// have made a blind retry into a duplicate-lead generator.

const searchResponse = (rows) => ({ statusCode: 200, body: { data: rows } });

test('an ambiguous failure checks whether the deal already exists BEFORE retrying', async () => {
  const seen = [];
  const j = await runCrm({
    payload: LEAD,
    env: FULL_ENV,
    httpRequest: async (o) => {
      seen.push(o.method);
      if (o.method === 'GET') {
        // The write DID land; the response was just lost on the way back.
        return searchResponse([{
          id: 'deal-recovered',
          name: 'jsmith',
          created_at: new Date().toISOString(),
          link: 'https://app.leadsimple.com/deal-recovered',
          contacts: [{ emails: ['jsmith@gmail.com'] }],
        }]);
      }
      return throws(504, { error: 'gateway timeout' })(o);
    },
  });
  assert.deepEqual(seen, ['POST', 'GET'], 'one POST, then look before leaping');
  assert.equal(seen.filter((m) => m === 'POST').length, 1, 'NO second POST: that would duplicate the lead');
  assert.equal(j.delivered_api, true, 'the deal exists, so this counts as delivered');
  assert.equal(j.crm_deal_id, 'deal-recovered');
  assert.equal(j.crm_deal_link, 'https://app.leadsimple.com/deal-recovered');
  assert.equal(j.crm_error, '');
});

test('if the read-back finds nothing, the retry proceeds normally', async () => {
  const seen = [];
  const delays = [];
  const j = await runCrm({
    payload: LEAD,
    env: FULL_ENV,
    delays,
    httpRequest: async (o) => {
      seen.push(o.method);
      if (o.method === 'GET') return searchResponse([]);
      return throws(503, { error: 'unavailable' })(o);
    },
  });
  assert.deepEqual(seen, ['POST', 'GET', 'POST', 'GET', 'POST', 'GET']);
  assert.deepEqual(delays, [2000, 8000]);
  assert.equal(j.delivered_api, false, 'nothing was ever created');
});

test('the read-back ignores a same-name deal belonging to a different email', async () => {
  const j = await runCrm({
    payload: LEAD,
    env: FULL_ENV,
    httpRequest: async (o) => {
      if (o.method === 'GET') {
        return searchResponse([{
          id: 'someone-else', name: 'jsmith', created_at: new Date().toISOString(),
          contacts: [{ emails: ['a.different.jsmith@example.com'] }],
        }]);
      }
      return throws(504, { error: 'gateway timeout' })(o);
    },
  });
  assert.equal(j.delivered_api, false, 'another person named jsmith is not our lead');
  assert.notEqual(j.crm_deal_id, 'someone-else');
});

test('the read-back ignores a stale deal from an earlier submission', async () => {
  const old = new Date(Date.now() - 45 * 60 * 1000).toISOString();
  const j = await runCrm({
    payload: LEAD,
    env: FULL_ENV,
    httpRequest: async (o) => {
      if (o.method === 'GET') {
        return searchResponse([{ id: 'last-month', name: 'jsmith', created_at: old, contacts: [{ emails: ['jsmith@gmail.com'] }] }]);
      }
      return throws(504, { error: 'gateway timeout' })(o);
    },
  });
  assert.equal(j.delivered_api, false, 'a 45-minute-old deal is a previous lead, not this one');
});

test('a 429 skips the read-back, because a rate-limited request never wrote', async () => {
  const seen = [];
  await runCrm({
    payload: LEAD,
    env: FULL_ENV,
    delays: [],
    httpRequest: async (o) => { seen.push(o.method); return throws(429, { error: 'Rate limit exceeded for records' })(o); },
  });
  assert.equal(seen.includes('GET'), false, 'no wasted read-back, and no wasted account-wide quota');
  assert.equal(seen.filter((m) => m === 'POST').length, 3);
});

test('a failing read-back does not mask the original error', async () => {
  const j = await runCrm({
    payload: LEAD,
    env: FULL_ENV,
    delays: [],
    httpRequest: async (o) => {
      if (o.method === 'GET') throw new Error('search is down too');
      return throws(502, { error: 'bad gateway' })(o);
    },
  });
  assert.equal(j.delivered_api, false);
  assert.match(j.crm_error, /HTTP 502/, 'the POST failure is what a human needs to see');
  assert.doesNotMatch(j.crm_error, /search is down/);
});

test('the read-back reads the LISTING, never the lagging search index', async () => {
  let url = '';
  await runCrm({
    payload: LEAD,
    env: FULL_ENV,
    delays: [],
    httpRequest: async (o) => {
      if (o.method === 'GET') { url = o.url; return searchResponse([]); }
      return throws(504, {})(o);
    },
  });
  // Verified live 2026-08-18, and this is the whole reason the guard works:
  //   - GET /deals?search=<full email> returns 0, the query breaks on the "@"
  //   - GET /deals?search=<deal name> found NOTHING seconds after creation,
  //     then found it 90s later. It is an index, and it lags.
  // The guard fires ~2s after a failed write, inside that lag window, so it
  // must read the direct ordered listing instead. If someone "simplifies" this
  // back to ?search= the guard still passes its happy path and silently stops
  // catching duplicates, which is why this asserts the URL shape.
  assert.match(url, /\/pipelines\/[^/]+\/deals\?/, 'the pipeline deals listing, got: ' + url);
  assert.match(url, /order_field=created_at/, 'ordered so a fresh deal is at the top');
  assert.match(url, /order_direction=desc/);
  assert.doesNotMatch(url, /[?&]search=/, 'must NOT use the lagging search index');
  assert.doesNotMatch(url, /%40/, 'and never an @, which matches nothing anyway');
});

// --- error legibility: the alert is worthless if it says [object Object] ---
// Both shapes below were produced by the REAL API on 2026-08-18. The array of
// objects is what rendered as "[object Object],[object Object]".

test('a string-shaped 400 body reaches the alert verbatim', async () => {
  const j = await runCrm({
    payload: LEAD,
    env: FULL_ENV,
    httpRequest: throws(400, { error: 'deal[pipeline_id] is missing' }),
  });
  assert.match(j.crm_error, /deal\[pipeline_id\] is missing/);
});

test('an ARRAY-of-objects 400 body is flattened, never "[object Object]"', async () => {
  const j = await runCrm({
    payload: LEAD,
    env: FULL_ENV,
    httpRequest: throws(400, { error: [{ pipeline_id: 'is invalid' }, { stage_id: 'does not belong to pipeline' }] }),
  });
  assert.doesNotMatch(j.crm_error, /\[object Object\]/, 'this is the exact bug the live e2e found');
  assert.match(j.crm_error, /pipeline_id: is invalid/);
  assert.match(j.crm_error, /stage_id: does not belong to pipeline/);
});

test('a bare array body, a nested errors key, and an empty body all stay readable', async () => {
  const shapes = [
    [[{ base: 'something broke' }], /base: something broke/],
    [{ errors: { deal: ['too many'], contact: ['bad email'] } }, /deal: too many; contact: bad email/],
    [undefined, /unknown error|HTTP 400/],
  ];
  for (const [body, expected] of shapes) {
    const j = await runCrm({ payload: LEAD, env: FULL_ENV, httpRequest: throws(400, body) });
    assert.doesNotMatch(j.crm_error, /\[object Object\]/, 'shape: ' + JSON.stringify(body));
    assert.match(j.crm_error, expected, 'shape: ' + JSON.stringify(body));
  }
});

test('a rate-limit body is legible AND the retry honours its header', async () => {
  let calls = 0;
  const delays = [];
  const j = await runCrm({
    payload: LEAD,
    env: FULL_ENV,
    delays,
    httpRequest: async () => {
      calls++;
      const e = new Error('HTTP 429');
      e.response = {
        status: 429,
        headers: { 'x-ratelimit-retry-after': '60', 'x-ratelimit-metric-error': 'records' },
        body: { error: 'Rate limit exceeded for records, please wait 1 minute before retrying' },
      };
      throw e;
    },
  });
  assert.match(j.crm_error, /Rate limit exceeded for records/, 'the real 429 body, observed live');
  assert.deepEqual(delays, [60000, 60000], 'the server said 60s, so we wait 60s, not our 2s/8s');
  assert.equal(calls, 3);
});

test('crm_error never runs away: it is capped and single-line', async () => {
  const huge = { error: Array.from({ length: 500 }, (_, i) => ({ ['field' + i]: 'x'.repeat(50) })) };
  const j = await runCrm({ payload: LEAD, env: FULL_ENV, httpRequest: throws(400, huge) });
  assert.ok(j.crm_error.length < 700, 'an alert email must stay readable, got ' + j.crm_error.length);
  assert.equal(j.crm_error.includes('\n'), false, 'no newlines to break the alert body');
});

test('a transient failure then success = delivered (via a clean second POST)', async () => {
  const seen = [];
  const delays = [];
  const j = await runCrm({
    payload: LEAD,
    env: FULL_ENV,
    delays,
    httpRequest: async (o) => {
      seen.push(o.method);
      // The read-back finds nothing, so the write genuinely did not land and a
      // second POST is the correct move.
      if (o.method === 'GET') return { statusCode: 200, body: { data: [] } };
      if (seen.filter((m) => m === 'POST').length === 1) {
        const e = new Error('ECONNRESET'); e.response = { status: 502, headers: {} }; throw e;
      }
      return { statusCode: 201, body: { data: { id: 'deal-r', link: 'L' } } };
    },
  });
  assert.deepEqual(seen, ['POST', 'GET', 'POST'], 'ambiguous failure -> look -> then retry');
  assert.deepEqual(delays, [2000]);
  assert.equal(j.delivered_api, true);
  assert.equal(j.crm_error, '', 'a recovered error must not leave a stale reason behind');
  assert.equal(j.crm_deal_id, 'deal-r');
});

test('a single-deal GET shape (data as an object) cannot crash the read-back', async () => {
  const seen = [];
  const j = await runCrm({
    payload: LEAD,
    env: FULL_ENV,
    delays: [],
    httpRequest: async (o) => {
      seen.push(o.method);
      // data as an OBJECT, not an array: for..of would throw and the catch would
      // turn a crash into a silent "no duplicate found".
      if (o.method === 'GET') return { statusCode: 200, body: { data: { id: 'x', name: 'jsmith' } } };
      return throws(504, { error: 'gateway timeout' })(o);
    },
  });
  assert.equal(j.delivered_api, false, 'an object is not a search hit');
  assert.equal(seen.filter((m) => m === 'POST').length, 3, 'and the retry ladder still ran');
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
