// Executes WF-0's token node and WF-1's "Verify, validate, dedupe" node the way
// n8n runs them, to prove the gateway lock (2026-11-10):
//   - with WGC_GATEWAY_SECRET unset, behaviour is unchanged (cutover switch)
//   - with it set, only calls carrying the secret get a token / are accepted
//   - consent IP/UA come from the gateway, never from X-Forwarded-For[0]
//   - consent ts is server time; the dedupe buffer is bounded
//
// Run: node --test n8n/test/wf1-gateway.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';

const load = (f) => JSON.parse(readFileSync(new URL('../workflows/' + f, import.meta.url), 'utf8'));
const code = (f, name) => load(f).nodes.find((n) => n.name === name).parameters.jsCode;

const HMAC = 'h'.repeat(40);
const GW = 'g'.repeat(40);

// In-memory fs stand-in for the metrics file the node bumps.
function fakeFs() {
  const files = {};
  return {
    files,
    readFileSync: (p) => { if (!(p in files)) throw new Error('ENOENT'); return files[p]; },
    writeFileSync: (p, d) => { files[p] = d; },
  };
}

function runNode(src, { json, env, staticData = {} }) {
  const fs = fakeFs();
  const req = (m) => (m === 'crypto' ? crypto : m === 'fs' ? fs : (() => { throw new Error('require ' + m); })());
  const fn = new Function('$json', '$env', 'require', '$getWorkflowStaticData', src);
  const out = fn(json, env, req, () => staticData);
  return { out: out[0].json, fs, staticData };
}

function mintToken(ageMs = 5_000) {
  const ts = String(Date.now() - ageMs);
  const nonce = 'abcd1234abcd1234';
  const mac = crypto.createHmac('sha256', HMAC).update(ts + '.' + nonce).digest('hex');
  return Buffer.from(ts + '.' + nonce + '.' + mac).toString('base64');
}

let seq = 0;
function lead(over = {}) {
  seq += 1;
  return {
    submission_id: `0f8fad5b-d9cb-469f-a165-7086772${String(10000 + seq).slice(-5)}`,
    zip: '76102', sqft: 1800, bedrooms: '3', ebook_opt_in: true, email: 'owner@example.com',
    consent: { explicit: true, text_version: 'v3-explicit-2026-07-22', ts: '1999-01-01T00:00:00Z' },
    token: mintToken(), fax: '', ...over,
  };
}

const WF0 = code('wf0-token.json', 'Issue HMAC token');
const WF1 = code('wf1-intake.json', 'Verify, validate, dedupe');

test('WF-0: without WGC_GATEWAY_SECRET, anyone still gets a token (cutover switch off)', () => {
  const { out } = runNode(WF0, { json: { headers: {} }, env: { WGC_HMAC_SECRET: HMAC } });
  assert.ok(out.token.length > 20);
});

test('WF-0: with the secret set, only the gateway gets a token', () => {
  const env = { WGC_HMAC_SECRET: HMAC, WGC_GATEWAY_SECRET: GW };
  assert.equal(runNode(WF0, { json: { headers: {} }, env }).out.token, '');
  assert.equal(runNode(WF0, { json: { headers: { 'x-wgc-gateway': 'wrong' } }, env }).out.token, '');
  assert.ok(runNode(WF0, { json: { headers: { 'x-wgc-gateway': GW } }, env }).out.token.length > 20);
});

test('WF-1: without the secret, a valid direct lead is accepted (unchanged behaviour)', () => {
  const { out } = runNode(WF1, {
    json: { body: lead(), headers: { 'x-real-ip': '198.51.100.4', 'x-forwarded-for': '6.6.6.6, 198.51.100.4', 'user-agent': 'UA' } },
    env: { WGC_HMAC_SECRET: HMAC },
  });
  assert.equal(out.bot, false);
  // Spoofed leading XFF entry is NOT recorded as consent evidence.
  assert.equal(out.payload.consent.ip, '198.51.100.4');
});

test('WF-1: with the secret set, direct submissions are rejected as bots', () => {
  const env = { WGC_HMAC_SECRET: HMAC, WGC_GATEWAY_SECRET: GW };
  const r = runNode(WF1, { json: { body: lead(), headers: {} }, env });
  assert.deepEqual(r.out, { bot: true, reason: 'gateway' });
  const wrong = runNode(WF1, { json: { body: lead(), headers: { 'x-wgc-gateway': 'g'.repeat(39) } }, env });
  assert.equal(wrong.out.reason, 'gateway');
});

test('WF-1: gateway submissions use the gateway-supplied IP/UA and server-time consent', () => {
  const env = { WGC_HMAC_SECRET: HMAC, WGC_GATEWAY_SECRET: GW };
  const before = Date.now();
  const { out } = runNode(WF1, {
    json: {
      body: lead({ source: 'x'.repeat(500) }),
      headers: { 'x-wgc-gateway': GW, 'x-wgc-client-ip': '203.0.113.9', 'x-wgc-client-ua': 'Real Browser', 'x-real-ip': '10.0.0.1', 'user-agent': 'node' },
    },
    env,
  });
  assert.equal(out.bot, false);
  assert.equal(out.payload.consent.ip, '203.0.113.9');
  assert.equal(out.payload.consent.ua, 'Real Browser');
  assert.ok(Date.parse(out.payload.consent.ts) >= before, 'consent ts is server receipt time, not the client claim');
  assert.equal(out.payload.source.length, 80);
});

test('WF-1: the HMAC token is still required behind the gateway (defense in depth)', () => {
  const env = { WGC_HMAC_SECRET: HMAC, WGC_GATEWAY_SECRET: GW };
  const { out } = runNode(WF1, { json: { body: lead({ token: 'forged' }), headers: { 'x-wgc-gateway': GW } }, env });
  assert.equal(out.reason, 'token');
});

test('WF-1: a gateway-verified lead is accepted even after the n8n token would have expired (durable queue)', () => {
  // Header Auth on the webhook (no env secret): the gateway header is present.
  const viaHeader = { 'x-wgc-gateway': GW, 'x-wgc-client-ip': '203.0.113.9', 'x-wgc-client-ua': 'Real Browser' };
  const queued = runNode(WF1, { json: { body: lead({ token: mintToken(5 * 3600_000), gateway_verified: true }), headers: viaHeader }, env: { WGC_HMAC_SECRET: HMAC } });
  assert.equal(queued.out.bot, false);
  // Same flag without the gateway header is NOT honoured.
  const direct = runNode(WF1, { json: { body: lead({ token: 'forged', gateway_verified: true }), headers: {} }, env: { WGC_HMAC_SECRET: HMAC } });
  assert.equal(direct.out.reason, 'token');
  // With the env secret set, a wrong header still fails the gateway check.
  const wrong = runNode(WF1, { json: { body: lead({ gateway_verified: true }), headers: { 'x-wgc-gateway': 'x'.repeat(40) } }, env: { WGC_HMAC_SECRET: HMAC, WGC_GATEWAY_SECRET: GW } });
  assert.equal(wrong.out.reason, 'gateway');
});

test('WF-1: the webhook itself requires the gateway header (Header Auth credential, not an env var)', () => {
  const hook = load('wf1-intake.json').nodes.find((n) => n.type === 'n8n-nodes-base.webhook');
  assert.equal(hook.parameters.authentication, 'headerAuth');
  assert.equal(hook.credentials.httpHeaderAuth.name, 'WGC gateway');
});

test('WF-1: the dedupe buffer is bounded under a flood of unique IDs', () => {
  const now = Date.now();
  const staticData = { seen: Array.from({ length: 6000 }, (_, i) => ({ id: 'id-' + i, t: now })) };
  runNode(WF1, { json: { body: lead(), headers: {} }, env: { WGC_HMAC_SECRET: HMAC }, staticData });
  assert.equal(staticData.seen.length, 5000);
});

test('WF-1: duplicates are still rejected', () => {
  const body = lead();
  const staticData = {};
  const env = { WGC_HMAC_SECRET: HMAC };
  assert.equal(runNode(WF1, { json: { body, headers: {} }, env, staticData }).out.bot, false);
  assert.equal(runNode(WF1, { json: { body, headers: {} }, env, staticData }).out.reason, 'duplicate');
});
