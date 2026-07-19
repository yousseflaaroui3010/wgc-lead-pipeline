// Own-data rent estimator — Layer 1 (PRD-03 / T-estimator).
//
// Northpoint's real playbook (FEATURE2-rent-estimator-strategy.md §0): estimate
// a rent RANGE by SEGMENT from Westrom's OWN closed/active lease outcomes, not
// by address AVM. This module is that Layer-1 primary layer: pure, zero runtime
// deps (TD-4), DOM-free and node --test-friendly like validate.js/success.js.
//
// It is provider-agnostic by shape: `estimateRent(query, leases)` takes an
// array of already-normalized leases (dependency-injected) and returns the
// exact `{ low, high, comps }` object that widget/src/success.js renders. Parcl
// (Layer 2) and a cached AVM (Layer 3) sit behind the same return shape later.
//
// Scope note: the DEPLOYED form v2 collects zip + sqft (required) + bedrooms
// (optional 2/3/4/5+) — NOT property type or baths. So the live query segment
// is { zip, sqft, beds? }. The CSV's type/baths are carried for future segment
// dimensions but are not required to produce an estimate today.
//
// GATE: nothing here wires a public response. Surfacing an on-screen estimate
// reverses locked decision LD-6 and needs OD-14 (Jon) signed → PRD-03. This
// file computes; it does not ship.

// --- CSV parsing (handles quoted fields with commas / $: "$1,895.00", "1,026") ---

/**
 * Minimal RFC-4180-ish CSV parser: quoted fields, embedded commas, doubled
 * quotes, CRLF/LF. Returns an array of row objects keyed by the header row.
 * Zero deps on purpose (TD-4).
 */
export function parseCsv(text) {
  const rows = [];
  let field = '';
  let record = [];
  let inQuotes = false;
  const src = String(text == null ? '' : text);

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } // escaped quote
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      record.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++; // swallow CRLF pair
      record.push(field); field = '';
      if (record.length > 1 || record[0] !== '') rows.push(record);
      record = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || record.length) { record.push(field); rows.push(record); }

  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const obj = {};
    header.forEach((h, idx) => { obj[h] = r[idx] == null ? '' : r[idx]; });
    return obj;
  });
}

// --- Field coercion ---

function parseMoney(s) {
  const n = Number(String(s == null ? '' : s).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseIntLoose(s) {
  const cleaned = String(s == null ? '' : s).replace(/[^0-9.]/g, '');
  if (cleaned === '') return null; // empty means "unknown", not 0
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function zip5(s) {
  const m = String(s == null ? '' : s).match(/\d{5}/);
  return m ? m[0] : null;
}

// Opaque, stable id for a physical unit, derived from its address so we can
// collapse repeat leases of the SAME home (the export is a lease history:
// 757 rows / 549 units). FNV-1a hash, never displayed — the address itself
// stays out of the index (PII rule). Null when there is no address to key on.
function unitId(address) {
  const s = String(address == null ? '' : address).trim().toLowerCase().replace(/\s+/g, ' ');
  if (!s) return null;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

// MM/DD/YYYY -> Date (UTC midnight) or null.
function parseUsDate(s) {
  const m = String(s == null ? '' : s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[3], +m[1] - 1, +m[2]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Normalize one Propertyware active-lease CSV row into an estimator lease.
 * Returns null if the row lacks the two things an estimate needs: a zip and a
 * rent. sqft/beds/baths/type/date are best-effort enrichment.
 */
export function normalizeLease(row) {
  const zip = zip5(row['Unit Zip']);
  const rent = parseMoney(row['Monthly Rent']);
  if (!zip || rent == null) return null;
  return {
    zip,
    city: String(row['Unit City'] || '').trim(),
    type: String(row['Building Type'] || '').trim(),
    beds: parseIntLoose(row['Bedrooms']),
    baths: (() => {
      const raw = String(row['Bathrooms'] == null ? '' : row['Bathrooms']).trim();
      if (raw === '') return null; // empty means "unknown", not 0
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    })(),
    sqft: parseIntLoose(row['Total Area']),
    rent,
    startDate: parseUsDate(row['Start Date']),
    uid: unitId(row['Unit Address']),
  };
}

/** Parse + normalize a full CSV export, dropping unusable rows. */
export function normalizeLeases(csvText) {
  return parseCsv(csvText).map(normalizeLease).filter(Boolean);
}

// The deployed runtime (n8n) does not read the gitignored CSV; it loads a
// pre-built segment index (build-index.mjs) whose `date` is an ISO string.
// loadIndex rehydrates that JSON back into the lease shape estimateRent wants
// (startDate as a Date). Accepts either the compact index records or already-
// normalized leases, so callers can pass whichever they have.
export function loadIndex(records) {
  if (!Array.isArray(records)) return [];
  return records.map((r) => ({
    zip: r.zip,
    city: r.city || '',
    type: r.type || '',
    beds: r.beds == null ? null : r.beds,
    baths: r.baths == null ? null : r.baths,
    sqft: r.sqft || null,
    rent: r.rent,
    startDate: r.startDate instanceof Date
      ? r.startDate
      : (r.date ? new Date(r.date) : (r.startDate ? new Date(r.startDate) : null)),
    uid: r.uid == null ? null : r.uid,
  })).filter((l) => l.zip && l.rent != null);
}

// Collapse a lease history to one record per physical unit, keeping each unit's
// MOST RECENT lease (current rent, no double-counting). Leases with no uid
// (no address to key on) are each kept as distinct. This is the estimate basis
// AND what stops the same home from appearing as three "different" comps.
export function dedupeByUnit(leases) {
  const best = new Map();
  const out = [];
  for (const l of leases) {
    if (!l.uid) { out.push(l); continue; }
    const t = l.startDate ? l.startDate.getTime() : -Infinity;
    const cur = best.get(l.uid);
    if (!cur || t > cur.t) best.set(l.uid, { l, t });
  }
  for (const { l } of best.values()) out.push(l);
  return out;
}

// --- Segment matching ---

// Form beds are '2'|'3'|'4'|'5+'. '5+' means >= 5; others are exact.
function bedsMatch(queryBeds, leaseBeds) {
  if (queryBeds == null || queryBeds === '') return true; // beds is optional
  if (leaseBeds == null) return false;
  const q = String(queryBeds).trim();
  if (q === '5+') return leaseBeds >= 5;
  const n = Number(q);
  return Number.isFinite(n) ? leaseBeds === n : true;
}

function withinSqft(querySqft, leaseSqft, tol) {
  if (!querySqft || !leaseSqft) return false;
  const lo = querySqft * (1 - tol);
  const hi = querySqft * (1 + tol);
  return leaseSqft >= lo && leaseSqft <= hi;
}

// Progressive widening: the first tier that yields >= MIN_COMPS wins; if none
// do, the widest non-empty tier is used so we always answer when data exists.
// Each tier is [label, predicate].
function buildTiers(query) {
  const zip = query.zip;
  const zip3 = zip ? zip.slice(0, 3) : null;
  const sqft = Number(query.sqft) || 0;
  const beds = query.beds;
  return [
    ['zip+beds+sqft15', (l) => l.zip === zip && bedsMatch(beds, l.beds) && withinSqft(sqft, l.sqft, 0.15)],
    ['zip+beds+sqft25', (l) => l.zip === zip && bedsMatch(beds, l.beds) && withinSqft(sqft, l.sqft, 0.25)],
    ['zip+beds',        (l) => l.zip === zip && bedsMatch(beds, l.beds)],
    ['zip+sqft25',      (l) => l.zip === zip && withinSqft(sqft, l.sqft, 0.25)],
    ['zip',             (l) => l.zip === zip],
    ['zip3+beds+sqft25',(l) => zip3 && l.zip.slice(0, 3) === zip3 && bedsMatch(beds, l.beds) && withinSqft(sqft, l.sqft, 0.25)],
    ['zip3+beds',       (l) => zip3 && l.zip.slice(0, 3) === zip3 && bedsMatch(beds, l.beds)],
    ['zip3',            (l) => zip3 && l.zip.slice(0, 3) === zip3],
  ];
}

function selectMatches(query, leases, minComps) {
  let widest = { label: 'none', matches: [] };
  for (const [label, pred] of buildTiers(query)) {
    const matches = leases.filter(pred);
    if (matches.length > widest.matches.length) widest = { label, matches };
    if (matches.length >= minComps) return { label, matches };
  }
  return widest; // best available, even if under minComps
}

// --- Range + comps ---

function percentile(sortedAsc, p) {
  if (!sortedAsc.length) return null;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const idx = (sortedAsc.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (idx - lo);
}

const roundTo = (n, step) => Math.round(n / step) * step;

function daysAgo(startDate, now) {
  if (!startDate) return null;
  const d = Math.round((now - startDate.getTime()) / 86400000);
  return d < 0 ? 0 : d; // active leases can have near-future start dates
}

// Pick up to `n` comps closest to the query (by sqft distance, then recency).
function pickComps(query, matches, n, now) {
  const sqft = Number(query.sqft) || 0;
  return matches
    .slice()
    .sort((a, b) => {
      const da = sqft && a.sqft ? Math.abs(a.sqft - sqft) : Number.MAX_SAFE_INTEGER;
      const db = sqft && b.sqft ? Math.abs(b.sqft - sqft) : Number.MAX_SAFE_INTEGER;
      if (da !== db) return da - db;
      const ta = a.startDate ? a.startDate.getTime() : 0;
      const tb = b.startDate ? b.startDate.getTime() : 0;
      return tb - ta; // more recent first
    })
    .slice(0, n)
    .map((l) => ({
      zip: l.zip,
      beds: l.beds == null ? '' : String(l.beds),
      sqft: l.sqft || '',
      ago_days: daysAgo(l.startDate, now),
      rent: l.rent,
    }));
}

/**
 * Compute an own-data rent estimate for a segment query.
 *
 * @param {{zip:string, sqft?:number|string, beds?:string|number}} query
 * @param {Array} leases  normalized leases (from normalizeLeases)
 * @param {{minComps?:number, now?:number, roundStep?:number}} [opts]
 * @returns {{low:number, high:number, comps:Array, meta:object} | null}
 *          null when there is no usable data at all (caller falls back to the
 *          non-estimate "received" success shape — success.js detectShape).
 */
export function estimateRent(query, leases, opts = {}) {
  const minComps = opts.minComps == null ? 5 : opts.minComps;
  const now = opts.now == null ? Date.now() : opts.now;
  const step = opts.roundStep == null ? 25 : opts.roundStep;

  const zip = zip5(query && query.zip);
  if (!zip || !Array.isArray(leases) || !leases.length) return null;

  // One observation per home (most recent lease) unless the caller opts out.
  const pool = opts.dedupe === false ? leases : dedupeByUnit(leases);

  const { label, matches } = selectMatches({ ...query, zip }, pool, minComps);
  if (!matches.length) return null;

  const rents = matches.map((l) => l.rent).sort((a, b) => a - b);
  const mid = percentile(rents, 0.5);
  let low = percentile(rents, 0.25);
  let high = percentile(rents, 0.75);

  // Thin sample (< 4 comps) => the IQR is noise; widen to a modest ±5% band
  // around the median so we never imply false precision.
  if (rents.length < 4) {
    low = mid * 0.95;
    high = mid * 1.05;
  }

  low = roundTo(low, step);
  high = roundTo(high, step);
  if (high < low) { const t = low; low = high; high = t; }

  // Never present a collapsed "$X – $X" point (strategy §5: show a RANGE, not a
  // false-precision single number). When comps cluster tightly, enforce a
  // minimum visible spread of ~5% of the median (>= 2 rounding steps), expanded
  // symmetrically around the midpoint.
  const minSpread = Math.max(2 * step, roundTo(mid * 0.05, step));
  if (high - low < minSpread) {
    low = roundTo(mid - minSpread / 2, step);
    high = roundTo(mid + minSpread / 2, step);
  }

  return {
    low,
    high,
    comps: pickComps({ ...query, zip }, matches, 3, now),
    meta: { tier: label, sampleSize: matches.length, source: 'own-lease-history' },
  };
}
