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

test('non-estimate shape: opted-in gets the follow-up message, no CTA', () => {
  const html = buildSuccessHtml({ status: 'received' }, { ebookOptIn: true });
  assert.ok(html.includes(STRINGS.receivedTitle));
  assert.ok(html.includes(STRINGS.receivedBody));
  assert.ok(!html.includes('wgc-cta'), 'received shape has no estimate CTA');
});

test('non-estimate shape: not opted in promises nothing we cannot keep', () => {
  const html = buildSuccessHtml({ status: 'received' }, { ebookOptIn: false });
  assert.ok(html.includes(STRINGS.noEstimateTitle));
  assert.ok(html.includes(STRINGS.noEstimateBody));
  assert.ok(!html.includes(STRINGS.receivedBody), 'no "we will follow up" when we have no contact info');
});

test('estimate shape renders range and up to 3 comps', () => {
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
  // Only 3 comps rendered even though 4 were supplied.
  assert.equal((html.match(/class="wgc-comp"/g) || []).length, 3);
});

test('expert-review CTA appears only when the visitor opted in (consent gate)', () => {
  const estimate = { low: 1800, high: 2100, comps: [] };
  const gated = buildSuccessHtml({ estimate }, { ebookOptIn: false });
  assert.ok(!gated.includes('wgc-cta'), 'no CTA without contact info to route');
  assert.ok(!gated.includes('wgc-thanks'));

  const shown = buildSuccessHtml({ estimate }, { ebookOptIn: true });
  assert.ok(shown.includes(STRINGS.cta));
  assert.ok(shown.includes('wgc-thanks'), 'hidden thank-you block present for the CTA to reveal');
});

test('out-of-area (RentCast market source): shows "based on N active rentals in {zip}", no comps', () => {
  const estimate = {
    low: 3700, high: 4300, comps: [],
    meta: { source: 'rentcast-market', beds: 3, listings: 42, zip: '78704' },
  };
  const html = buildSuccessHtml({ estimate }, { ebookOptIn: false });
  assert.ok(html.includes('Estimate based on 42 active rentals in 78704'));
  assert.ok(!html.includes('class="wgc-comp"'), 'never renders individual provider listings');
  assert.ok(!html.includes(STRINGS.compsHeading), 'no comps heading when there are no comps');
});

test('estimate with neither comps nor a listings count: range only, no basis line', () => {
  const html = buildSuccessHtml({ estimate: { low: 1, high: 2, comps: [] } }, { ebookOptIn: false });
  assert.ok(!html.includes('wgc-basis'));
  assert.ok(!html.includes('active rental'));
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
