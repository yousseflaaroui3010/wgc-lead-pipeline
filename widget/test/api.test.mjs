// Payload contract tests: canonical schema v1.0 (PRD §E) shape, consent
// semantics (FR-2/FR-3 client half), UUID fallback, UTM parsing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPayload,
  newSubmissionId,
  readUtm,
  SCHEMA_VERSION,
  CONSENT_TEXT_VERSION,
} from '../src/api.js';

const DATA = {
  first_name: 'Jon', last_name: 'Westrom',
  email: 'jon@westromgroup.com', phone: '+18174451108',
  property_address: '100 Main St, Haslet, TX',
  beds: 3, baths: 2.5, message: null, tcpa: true,
};

const CTX = {
  submissionId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  source: 'Website - wgcassetguide',
  pageUrl: 'https://wgcassetguide.com/analysis?utm_source=x',
  utm: { source: 'x', medium: '', campaign: '' },
};

test('payload matches canonical contract v1.0 keys exactly', () => {
  const p = buildPayload(DATA, CTX);
  assert.deepEqual(Object.keys(p).sort(), [
    'baths', 'beds', 'consent', 'email', 'first_name', 'last_name',
    'message', 'page_url', 'phone', 'property_address', 'schema_version',
    'source', 'submission_id', 'utm',
  ]);
  assert.equal(p.schema_version, SCHEMA_VERSION);
  assert.equal(p.submission_id, CTX.submissionId);
  assert.equal(p.source, 'Website - wgcassetguide');
});

test('consent block: tcpa boolean, ISO timestamp, pinned text version; ip/ua are server-side only', () => {
  const p = buildPayload(DATA, CTX);
  assert.equal(p.consent.tcpa, true);
  assert.equal(p.consent.text_version, CONSENT_TEXT_VERSION);
  assert.ok(!Number.isNaN(Date.parse(p.consent.timestamp)));
  assert.ok(!('ip' in p.consent), 'client must not self-report IP');
  assert.ok(!('user_agent' in p.consent), 'client must not self-report UA');
});

test('unchecked consent submits with tcpa=false (FR-2: lead still delivers)', () => {
  const p = buildPayload(Object.assign({}, DATA, { tcpa: false }), CTX);
  assert.equal(p.consent.tcpa, false);
});

test('newSubmissionId returns UUID v4 shape (incl. non-randomUUID fallback)', () => {
  const re = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  assert.match(newSubmissionId(), re);
  // Force the Safari 15.0-15.3 fallback branch.
  const original = crypto.randomUUID;
  try {
    Object.defineProperty(globalThis.crypto, 'randomUUID', { value: undefined, configurable: true });
    assert.match(newSubmissionId(), re);
  } finally {
    Object.defineProperty(globalThis.crypto, 'randomUUID', { value: original, configurable: true });
  }
});

test('readUtm extracts only the three contract keys, empty-string defaults', () => {
  assert.deepEqual(readUtm('?utm_source=g&utm_medium=cpc&utm_campaign=spring&foo=1'), {
    source: 'g', medium: 'cpc', campaign: 'spring',
  });
  assert.deepEqual(readUtm(''), { source: '', medium: '', campaign: '' });
});
