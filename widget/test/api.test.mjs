// Payload contract tests (form v2): canonical shape, implied-consent
// semantics, ebook flag, UUID fallback.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPayload,
  newSubmissionId,
  CONSENT_TEXT_VERSION,
} from '../src/api.js';

const DATA = {
  name: 'Jon Westrom', email: 'jon@westromgroup.com', phone: '+18174451108',
  zip: '76052', sqft: 1850, bedrooms: '3', ebook_opt_in: false,
};
const CTX = { submissionId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' };

test('payload matches the v2 canonical field set', () => {
  const p = buildPayload(DATA, CTX);
  assert.deepEqual(Object.keys(p).sort(), [
    'bedrooms', 'consent', 'ebook_opt_in', 'email', 'name',
    'phone', 'sqft', 'submission_id', 'zip',
  ]);
  assert.equal(p.name, 'Jon Westrom');
  assert.equal(p.zip, '76052');
  assert.equal(p.sqft, 1850);
  assert.equal(p.bedrooms, '3');
  assert.equal(p.submission_id, CTX.submissionId);
});

test('consent block: implied true, pinned text_version, ISO ts; ip/ua are server-side only', () => {
  const p = buildPayload(DATA, CTX);
  assert.equal(p.consent.implied, true);
  assert.equal(p.consent.text_version, CONSENT_TEXT_VERSION);
  assert.equal(CONSENT_TEXT_VERSION, 'v2-2026-07-16');
  assert.ok(!Number.isNaN(Date.parse(p.consent.ts)));
  assert.ok(!('ip' in p.consent), 'client must not self-report IP');
  assert.ok(!('ua' in p.consent), 'client must not self-report UA');
});

test('bedrooms omitted -> null in payload', () => {
  const p = buildPayload(Object.assign({}, DATA, { bedrooms: null }), CTX);
  assert.equal(p.bedrooms, null);
});

test('ebook_opt_in flows into the payload as a boolean', () => {
  assert.equal(buildPayload(Object.assign({}, DATA, { ebook_opt_in: true }), CTX).ebook_opt_in, true);
  assert.equal(buildPayload(Object.assign({}, DATA, { ebook_opt_in: false }), CTX).ebook_opt_in, false);
  // Non-boolean coerces to false (only an explicit true opts in).
  assert.equal(buildPayload(Object.assign({}, DATA, { ebook_opt_in: 'yes' }), CTX).ebook_opt_in, false);
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
