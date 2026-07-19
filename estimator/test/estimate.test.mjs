// Unit tests for the own-data rent estimator (T-estimator, PRD-03).
// Hermetic: uses a small inline CSV fixture, no dependency on the real
// gitignored lease export. Run: node --test estimator/test/estimate.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCsv,
  normalizeLease,
  normalizeLeases,
  loadIndex,
  estimateRent,
} from '../src/estimate.js';

// Header matches the real Propertyware export column order.
const CSV = [
  'Unit Address,Unit City,Unit Zip,Start Date,Monthly Rent,Year Built,Total Area,Bathrooms,Bedrooms,Building Type',
  '1 A St,Arlington,76001-5253,07/11/2026,"$1,800.00",1983,"1,000",2.0,3,House',
  '2 B St,Arlington,76001-1111,07/01/2026,"$1,900.00",1990,"1,050",2.0,3,House',
  '3 C St,Arlington,76001-2222,06/15/2026,"$2,000.00",1995,"1,100",2.5,3,House',
  '4 D St,Arlington,76001-3333,06/01/2026,"$2,100.00",2001,"1,150",2.0,3,House',
  '5 E St,Arlington,76001-4444,05/20/2026,"$2,200.00",2005,"1,200",3.0,3,House',
  '6 F St,Arlington,76001-5555,05/01/2026,"$2,600.00",2010,"1,900",3.0,4,House',
  '7 G St,Fort Worth,76108-4629,07/06/2026,"$1,695.00",2011,"1,091",1.5,3,House',
  '8 H St,Arlington,76001-6666,04/01/2026,"$900.00",1970,,,,House', // missing sqft/beds/baths
].join('\n');

const NOW = Date.UTC(2026, 6, 19); // 2026-07-19, matches project "today"

test('parseCsv handles quoted commas and dollar amounts', () => {
  const rows = parseCsv(CSV);
  assert.equal(rows.length, 8);
  assert.equal(rows[0]['Monthly Rent'], '$1,800.00');
  assert.equal(rows[0]['Total Area'], '1,000');
  assert.equal(rows[0]['Unit Zip'], '76001-5253');
});

test('normalizeLease coerces zip/rent/sqft/beds and drops PII columns', () => {
  const rows = parseCsv(CSV);
  const l = normalizeLease(rows[0]);
  assert.equal(l.zip, '76001'); // +4 stripped
  assert.equal(l.rent, 1800);
  assert.equal(l.sqft, 1000);
  assert.equal(l.beds, 3);
  assert.equal(l.baths, 2);
  assert.equal(l.type, 'House');
  assert.equal('address' in l, false); // no address carried through
});

test('normalizeLease returns null without a zip or rent', () => {
  assert.equal(normalizeLease({ 'Unit Zip': '', 'Monthly Rent': '$1,000' }), null);
  assert.equal(normalizeLease({ 'Unit Zip': '76001', 'Monthly Rent': '' }), null);
});

test('normalizeLeases keeps rows with zip+rent even if sqft/beds missing', () => {
  const leases = normalizeLeases(CSV);
  assert.equal(leases.length, 8); // the $900 row has zip+rent, so it stays
  const thin = leases.find((l) => l.rent === 900);
  assert.equal(thin.sqft, null);
  assert.equal(thin.beds, null);
});

test('estimateRent returns the {low, high, comps} shape success.js consumes', () => {
  const leases = normalizeLeases(CSV);
  const est = estimateRent({ zip: '76001', sqft: 1100, beds: '3' }, leases, { now: NOW });
  assert.ok(est, 'expected an estimate');
  assert.equal(typeof est.low, 'number');
  assert.equal(typeof est.high, 'number');
  assert.ok(est.low <= est.high);
  assert.ok(Array.isArray(est.comps));
  assert.ok(est.comps.length >= 1 && est.comps.length <= 3);
  const c = est.comps[0];
  for (const k of ['zip', 'beds', 'sqft', 'ago_days', 'rent']) assert.ok(k in c);
});

test('estimate range brackets the comparable rents (IQR of the 5 3-bed 76001 leases)', () => {
  const leases = normalizeLeases(CSV);
  // 3-bed 76001 rents: 1800,1900,2000,2100,2200 -> IQR ~1900..2100.
  const est = estimateRent({ zip: '76001', sqft: 1100, beds: '3' }, leases, { now: NOW });
  assert.ok(est.low >= 1800 && est.low <= 2000, `low=${est.low}`);
  assert.ok(est.high >= 2000 && est.high <= 2200, `high=${est.high}`);
  assert.equal(est.meta.source, 'own-lease-history');
});

test('rounds to the nearest $25 (no false precision)', () => {
  const leases = normalizeLeases(CSV);
  const est = estimateRent({ zip: '76001', sqft: 1100, beds: '3' }, leases, { now: NOW });
  assert.equal(est.low % 25, 0);
  assert.equal(est.high % 25, 0);
});

test('5+ beds query matches leases with 5 or more bedrooms', () => {
  const leases = normalizeLeases(CSV).concat(
    normalizeLeases('Unit Zip,Start Date,Monthly Rent,Total Area,Bathrooms,Bedrooms,Building Type\n' +
      '76001,05/01/2026,"$3,000.00","2,400",3.0,5,House')
  );
  const est = estimateRent({ zip: '76001', sqft: 2400, beds: '5+' }, leases, { now: NOW, minComps: 1 });
  assert.ok(est);
  assert.ok(est.comps.some((c) => c.beds === '5'));
});

test('thin sample (<4 comps) widens to a modest band, not a single number', () => {
  const leases = normalizeLeases(CSV);
  // Only the 4-bed lease at 1900 sqft in 76001 -> 1 comp.
  const est = estimateRent({ zip: '76001', sqft: 1900, beds: '4' }, leases, { now: NOW, minComps: 5 });
  // With minComps unreachable at the tightest tier it still answers; the band
  // must not collapse to low === high when derived from a single rent.
  if (est.meta.sampleSize < 4) assert.ok(est.high > est.low, 'thin band should not be a point');
});

test('range never collapses to a point even when comps are identical', () => {
  // Six leases at exactly the same rent -> IQR would be zero; the min-spread
  // floor must still produce low < high (strategy §5: always show a range).
  const rows = ['Unit Zip,Start Date,Monthly Rent,Total Area,Bathrooms,Bedrooms,Building Type'];
  for (let i = 0; i < 6; i++) rows.push('76099,05/01/2026,"$2,000.00","1,500",2.0,3,House');
  const leases = normalizeLeases(rows.join('\n'));
  const est = estimateRent({ zip: '76099', sqft: 1500, beds: '3' }, leases, { now: NOW });
  assert.ok(est.high > est.low, `expected a range, got ${est.low}-${est.high}`);
});

test('comps ago_days is non-negative even for near-future active leases', () => {
  const leases = normalizeLeases(CSV);
  const est = estimateRent({ zip: '76001', sqft: 1000, beds: '3' }, leases, { now: NOW });
  for (const c of est.comps) assert.ok(c.ago_days == null || c.ago_days >= 0);
});

test('unknown zip with no data returns null (caller falls back to received shape)', () => {
  const leases = normalizeLeases(CSV);
  assert.equal(estimateRent({ zip: '99999', sqft: 1000, beds: '3' }, leases, { now: NOW }), null);
  assert.equal(estimateRent({ zip: '76001' }, [], { now: NOW }), null);
});

test('loadIndex rehydrates ISO date records into the lease shape estimateRent uses', () => {
  // Mirrors what build-index.mjs emits: compact records with `date` as ISO.
  const records = normalizeLeases(CSV).map((l) => ({
    zip: l.zip, beds: l.beds, baths: l.baths, sqft: l.sqft, rent: l.rent,
    date: l.startDate ? l.startDate.toISOString().slice(0, 10) : null,
    type: l.type,
  }));
  const leases = loadIndex(records);
  assert.equal(leases.length, records.length);
  assert.ok(leases[0].startDate instanceof Date);
  const est = estimateRent({ zip: '76001', sqft: 1100, beds: '3' }, leases, { now: NOW });
  assert.ok(est && est.low <= est.high);
  // ago_days must still compute correctly from the rehydrated date.
  assert.ok(est.comps.every((c) => c.ago_days == null || c.ago_days >= 0));
});

test('missing beds still estimates from zip+sqft (beds is optional in form v2)', () => {
  const leases = normalizeLeases(CSV);
  const est = estimateRent({ zip: '76001', sqft: 1100 }, leases, { now: NOW });
  assert.ok(est, 'estimate should work without beds');
  assert.ok(est.low <= est.high);
});
