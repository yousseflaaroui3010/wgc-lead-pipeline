// Success-state rendering tests (#11, #12): both response shapes and the
// ebook line. Pure HTML-string assertions, no DOM needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectShape,
  buildSuccessHtml,
  STRINGS,
} from '../src/success.js';

test('detectShape: presence of estimate selects the card', () => {
  assert.equal(detectShape({ status: 'received' }), 'received');
  assert.equal(detectShape({ ok: true }), 'received');
  assert.equal(detectShape({ estimate: { low: 1, high: 2 } }), 'estimate');
  assert.equal(detectShape(null), 'received');
});

test('received shape renders the request-received message', () => {
  const html = buildSuccessHtml({ status: 'received' }, { ebookOptIn: false });
  assert.ok(html.includes(STRINGS.receivedTitle));
  assert.ok(html.includes(STRINGS.receivedBody));
  assert.ok(!html.includes('wgc-cta'), 'received shape has no estimate CTA');
});

test('estimate shape renders range, up to 3 comps, and the CTA', () => {
  const estimate = {
    low: 1800, high: 2100,
    comps: [
      { zip: '76052', beds: 3, sqft: 1850, rent: 1950, ago_days: 12 },
      { zip: '76052', beds: 3, sqft: 1900, rent: 2000, ago_days: 20 },
      { zip: '76052', beds: 4, sqft: 2100, rent: 2150, ago_days: 5 },
      { zip: '76052', beds: 2, sqft: 1500, rent: 1700, ago_days: 30 },
    ],
  };
  const html = buildSuccessHtml({ estimate }, { ebookOptIn: false });
  assert.ok(html.includes('$1,800'));
  assert.ok(html.includes('$2,100'));
  assert.ok(html.includes(STRINGS.cta));
  assert.ok(html.includes('wgc-thanks'), 'hidden thank-you block is present for the CTA to reveal');
  // Only 3 comps rendered even though 4 were supplied.
  assert.equal((html.match(/class="wgc-comp"/g) || []).length, 3);
});

test('ebook line appears only when opted in (#12)', () => {
  assert.ok(buildSuccessHtml({ status: 'received' }, { ebookOptIn: true }).includes(STRINGS.ebookSent));
  assert.ok(!buildSuccessHtml({ status: 'received' }, { ebookOptIn: false }).includes(STRINGS.ebookSent));
  assert.ok(buildSuccessHtml({ estimate: { low: 1, high: 2 } }, { ebookOptIn: true }).includes(STRINGS.ebookSent));
});

test('output is HTML-escaped against hostile comp data', () => {
  const html = buildSuccessHtml(
    { estimate: { low: 1, high: 2, comps: [{ zip: '<script>', beds: 3, sqft: 1, rent: 1, ago_days: 1 }] } },
    { ebookOptIn: false }
  );
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});
