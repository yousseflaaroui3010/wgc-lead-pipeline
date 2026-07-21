// Layer 3 fallback for the rent estimator (PRD-03 / FEATURE2 strategy section 5):
// when Westrom's own lease data (Layer 1, estimate.js) has no comps for a
// segment, derive a range from RentCast's zip-level market statistics
// (GET /v1/markets?zipCode=&dataType=Rental -> rentalData.dataByBedrooms[]).
//
// This module is PURE and dependency-injected, the same discipline as
// estimate.js: the n8n glue (build-wf.mjs) does the HTTP call plus the 30-day
// disk cache; here we only map a rentalData object to the {low, high, comps,
// meta} shape success.js renders, and decide whether a cache entry is fresh.
// That keeps it node --test friendly with no network.
//
// We use the MARKETS endpoint (aggregate zip stats), NOT the address AVM: the
// form only collects zip + sqft + beds, and segment-level stats also sidestep
// DISPLAYING RentCast's individual property comps. Their ToS governs comp
// display; a single derived range is the cheaper path (strategy section 4.2).
// So comps is always [] for this source and the widget shows the range only.

export const RENTCAST_TTL_DAYS = 30;

const rcRoundTo = (n, step) => Math.round(n / step) * step;

// Form beds are '2'|'3'|'4'|'5+'|''. Return the matching dataByBedrooms entry,
// or null if beds is unknown or has no exact match (caller then falls back to
// the overall rentalData aggregate).
export function pickBedroomStats(rentalData, beds) {
  const arr = rentalData && Array.isArray(rentalData.dataByBedrooms) ? rentalData.dataByBedrooms : [];
  if (!arr.length) return null;
  const q = String(beds == null ? '' : beds).trim();
  if (!q) return null;
  if (q === '5+') {
    const five = arr
      .filter((e) => Number(e.bedrooms) >= 5)
      .sort((a, b) => Number(a.bedrooms) - Number(b.bedrooms));
    return five[0] || null;
  }
  const n = Number(q);
  if (!Number.isFinite(n)) return null;
  return arr.find((e) => Number(e.bedrooms) === n) || null;
}

// Build {low, high} from a stats object carrying median/average rent. Median
// centered, +/-7.5% band (averageRent fallback), rounded to the step, with a
// minimum visible spread so we never imply a false-precision single number
// (mirrors estimate.js). Returns null if there is no usable central rent.
function bandFromStats(stats, step) {
  if (!stats) return null;
  const mid = Number(stats.medianRent) || Number(stats.averageRent) || 0;
  if (!(mid > 0)) return null;
  let low = rcRoundTo(mid * 0.925, step);
  let high = rcRoundTo(mid * 1.075, step);
  const minSpread = Math.max(2 * step, rcRoundTo(mid * 0.05, step));
  if (high - low < minSpread) {
    low = rcRoundTo(mid - minSpread / 2, step);
    high = rcRoundTo(mid + minSpread / 2, step);
  }
  if (high < low) { const t = low; low = high; high = t; }
  return { low, high };
}

/**
 * Map a RentCast /markets rentalData object to the estimate shape.
 * @param {object} rentalData  the rentalData field from the markets response
 * @param {{beds?:string|number}} query
 * @param {{roundStep?:number}} [opts]
 * @returns {{low:number, high:number, comps:Array, meta:object} | null}
 *          null when there is no usable rental statistic (caller then shows the
 *          non-estimate "received" success shape).
 */
export function marketToEstimate(rentalData, query, opts = {}) {
  if (!rentalData) return null;
  const step = opts.roundStep == null ? 25 : opts.roundStep;
  const byBed = pickBedroomStats(rentalData, query && query.beds);
  const stats = byBed || rentalData; // fall back to the overall zip aggregate
  const band = bandFromStats(stats, step);
  if (!band) return null;
  return {
    low: band.low,
    high: band.high,
    comps: [],
    meta: {
      source: 'rentcast-market',
      beds: byBed ? Number(byBed.bedrooms) : null,
      listings: Number(stats.totalListings) || null,
    },
  };
}

// A cache entry { fetchedAt: ISO, rentalData } is fresh within ttlDays.
export function isCacheFresh(entry, nowMs, ttlDays = RENTCAST_TTL_DAYS) {
  if (!entry || !entry.fetchedAt) return false;
  const t = Date.parse(entry.fetchedAt);
  if (!Number.isFinite(t)) return false;
  return (nowMs - t) < ttlDays * 86400000;
}
