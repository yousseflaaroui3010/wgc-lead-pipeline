// Payload contract tests (estimate-first): canonical shape, EXPLICIT consent
// only when opted in, ebook flag, UUID fallback.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPayload,
  newSubmissionId,
  CONSENT_TEXT_VERSION,
  DEFAULT_API_BASE,
  submitLead,
} from '../src/api.js';

// A validateAll() output for an opted-in visitor (no name/phone collected).
const DATA = {
  zip: '76052', sqft: 1850, bedrooms: '3',
  email: 'jon@westromgroup.com', ebook_opt_in: true,
};
const CTX = { submissionId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' };

test('payload keeps the canonical field set', () => {
  const p = buildPayload(DATA, CTX);
  assert.deepEqual(Object.keys(p).sort(), [
    'bedrooms', 'consent', 'ebook_opt_in', 'email', 'name',
    'phone', 'sqft', 'submission_id', 'zip',
  ]);
  assert.equal(p.zip, '76052');
  assert.equal(p.sqft, 1850);
  assert.equal(p.bedrooms, '3');
  assert.equal(p.submission_id, CTX.submissionId);
});

test('name and phone are no longer collected (empty strings, downstream-safe)', () => {
  const p = buildPayload(DATA, CTX);
  assert.equal(p.name, '');
  assert.equal(p.phone, '');
});

test('opted in: email + explicit consent present; ip/ua are server-side only', () => {
  const p = buildPayload(DATA, CTX);
  assert.equal(p.email, 'jon@westromgroup.com');
  assert.equal(p.ebook_opt_in, true);
  assert.equal(p.consent.explicit, true);
  assert.equal(p.consent.text_version, CONSENT_TEXT_VERSION);
  assert.equal(CONSENT_TEXT_VERSION, 'v3-explicit-2026-07-22');
  assert.ok(!Number.isNaN(Date.parse(p.consent.ts)));
  assert.ok(!('ip' in p.consent), 'client must not self-report IP');
  assert.ok(!('ua' in p.consent), 'client must not self-report UA');
});

test('not opted in: no email, no consent block', () => {
  const p = buildPayload({ zip: '76052', sqft: 1850, bedrooms: '3', email: null, ebook_opt_in: false }, CTX);
  assert.equal(p.email, '');
  assert.equal(p.ebook_opt_in, false);
  assert.equal(p.consent, null);
});

test('opt-in requires a real email: ticked box but no email is treated as not opted in', () => {
  const p = buildPayload({ zip: '76052', sqft: 1850, bedrooms: '3', email: null, ebook_opt_in: true }, CTX);
  assert.equal(p.ebook_opt_in, false);
  assert.equal(p.email, '');
  assert.equal(p.consent, null);
});

test('bedrooms omitted -> null in payload', () => {
  const p = buildPayload(Object.assign({}, DATA, { bedrooms: null }), CTX);
  assert.equal(p.bedrooms, null);
});

test('newSubmissionId returns UUID v4 shape (incl. non-randomUUID fallback)', () => {
  const re = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  assert.match(newSubmissionId(), re);
  const original = crypto.randomUUID;
  try {
    Object.defineProperty(globalThis.crypto, 'randomUUID', { value: undefined, configurable: true });
    assert.match(newSubmissionId(), re);
  } finally {
    Object.defineProperty(globalThis.crypto, 'randomUUID', { value: original, configurable: true });
  }
});

// --- Gateway cutover (2026-11-10) ---

test('default endpoint is the wgcassetguide.com gateway, not the n8n host', () => {
  assert.equal(DEFAULT_API_BASE, 'https://wgcassetguide.com/api/leads');
  assert.ok(!/railway\.app/.test(DEFAULT_API_BASE));
});

test('submitLead sends the Turnstile token only when one was obtained', async () => {
  const bodies = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => { bodies.push(JSON.parse(init.body)); return new Response('{"ok":true}'); };
  try {
    await submitLead('https://x/api/leads', { zip: '76102' }, { token: 't', honeypot: '', fillMs: 5000 });
    await submitLead('https://x/api/leads', { zip: '76102' }, { token: 't', honeypot: '', fillMs: 5000, turnstile: 'cf-tok' });
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.ok(!('turnstile' in bodies[0]));
  assert.equal(bodies[1].turnstile, 'cf-tok');
});
