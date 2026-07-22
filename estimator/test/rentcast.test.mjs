import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  marketToEstimate,
  pickBedroomStats,
  isCacheFresh,
  RENTCAST_TTL_DAYS,
} from '../src/rentcast.js';

// A representative /v1/markets rentalData payload (fields per RentCast schema).
const rentalData = {
  averageRent: 2000,
  medianRent: 1950,
  minRent: 900,
  maxRent: 4200,
  totalListings: 180,
  dataByBedrooms: [
    { bedrooms: 2, medianRent: 1600, averageRent: 1650, minRent: 1200, maxRent: 2200, totalListings: 40 },
    { bedrooms: 3, medianRent: 2000, averageRent: 2050, minRent: 1500, maxRent: 3000, totalListings: 90 },
    { bedrooms: 5, medianRent: 3200, averageRent: 3300, minRent: 2600, maxRent: 4500, totalListings: 12 },
  ],
};

test('pickBedroomStats: exact bedroom match', () => {
  assert.equal(pickBedroomStats(rentalData, '3').medianRent, 2000);
  assert.equal(pickBedroomStats(rentalData, 2).medianRent, 1600);
});

test("pickBedroomStats: '5+' picks the lowest entry >= 5", () => {
  assert.equal(pickBedroomStats(rentalData, '5+').bedrooms, 5);
});

test('pickBedroomStats: unknown/absent beds returns null (caller uses aggregate)', () => {
  assert.equal(pickBedroomStats(rentalData, ''), null);
  assert.equal(pickBedroomStats(rentalData, null), null);
  assert.equal(pickBedroomStats(rentalData, '4'), null); // no 4-bed entry
});

test('marketToEstimate: median-centered band around the matched bedroom', () => {
  const est = marketToEstimate(rentalData, { beds: '3' });
  // median 2000 -> +/-7.5% = 1850..2150, rounded to 25
  assert.equal(est.low, 1850);
  assert.equal(est.high, 2150);
  assert.deepEqual(est.comps, []); // markets endpoint => never shows comps
  assert.equal(est.meta.source, 'rentcast-market');
  assert.equal(est.meta.beds, 3);
  assert.equal(est.meta.listings, 90);
  assert.ok(est.high > est.low);
});

test('marketToEstimate: passes the queried zip into meta for the widget basis line', () => {
  assert.equal(marketToEstimate(rentalData, { beds: '3', zip: '78704' }).meta.zip, '78704');
  assert.equal(marketToEstimate(rentalData, { beds: '3' }).meta.zip, null);
});

test('marketToEstimate: falls back to the overall aggregate when beds has no entry', () => {
  const est = marketToEstimate(rentalData, { beds: '4' });
  assert.ok(est, 'still returns an estimate from the zip aggregate');
  assert.equal(est.meta.beds, null);
  // overall median 1950 -> 1800..2100
  assert.equal(est.low, 1800);
  assert.equal(est.high, 2100);
});

test('marketToEstimate: uses averageRent when medianRent is missing', () => {
  const est = marketToEstimate({ averageRent: 2000, dataByBedrooms: [] }, { beds: '3' });
  assert.equal(est.low, 1850);
  assert.equal(est.high, 2150);
});

test('marketToEstimate: enforces a minimum visible spread (no collapsed range)', () => {
  const est = marketToEstimate({ medianRent: 100, dataByBedrooms: [] }, { beds: '' });
  assert.ok(est.high - est.low >= 50, 'at least a 2-step ($50) visible spread');
});

test('marketToEstimate: null/empty rental data returns null', () => {
  assert.equal(marketToEstimate(null, { beds: '3' }), null);
  assert.equal(marketToEstimate({ dataByBedrooms: [] }, { beds: '3' }), null);
  assert.equal(marketToEstimate({ medianRent: 0, averageRent: 0 }, { beds: '' }), null);
});

test('isCacheFresh: fresh within TTL, stale beyond it', () => {
  const now = Date.UTC(2026, 6, 21);
  const fresh = { fetchedAt: new Date(now - 5 * 86400000).toISOString() };
  const stale = { fetchedAt: new Date(now - (RENTCAST_TTL_DAYS + 1) * 86400000).toISOString() };
  assert.equal(isCacheFresh(fresh, now), true);
  assert.equal(isCacheFresh(stale, now), false);
});

test('isCacheFresh: missing/invalid entry is never fresh', () => {
  const now = Date.now();
  assert.equal(isCacheFresh(null, now), false);
  assert.equal(isCacheFresh({}, now), false);
  assert.equal(isCacheFresh({ fetchedAt: 'not-a-date' }, now), false);
});
