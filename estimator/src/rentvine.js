// Rentvine -> estimator segment index (WF-4 "Rentvine sync").
//
// Pure, zero-dep (TD-4) and node --test-friendly like estimate.js; build-wf4.mjs
// generates it into WF-4's Code nodes so the n8n copy is never hand-maintained.
//
// Source: GET https://<corp>.rentvine.com/api/manager/leases/export
//   (Basic auth: API key / API secret, kept in n8n's encrypted credential
//   store). Each row has { lease, balances, unpaidCharges, property, unit,
//   portfolio }; the response is a list or { data: [...] } (same unwrapping
//   as the security-deposit app's RentvineClient._rows).
//
// Output records match estimator/build-index.mjs exactly, so WF-1's Compute
// node reads them unchanged: { zip, beds, baths, sqft, rent, date, uid }.
// No address, no tenant, no owner: the index is not PII.

const RV_PAGE_SIZE = 100;
// Freshness and rate limits (n8n workflow static data holds the timestamps).
const RV_FRESH_HOURS = 20; // a scheduled/boot sync is skipped if newer than this
const RV_FORCE_MIN_MINUTES = 10; // a forced (webhook) sync at most this often
const RV_PING_MIN_SECONDS = 30; // a ping at most this often; else cached answer
// A new index replacing a good one must be at least this share of it, so a
// partial/failed Rentvine read can never wipe the estimator.
const RV_MIN_KEEP_RATIO = 0.6;
const RV_MIN_RECORDS = 20;

function rvRows(items) {
  const out = [];
  for (const it of items || []) {
    const j = it && it.json !== undefined ? it.json : it;
    if (Array.isArray(j)) { out.push(...j); continue; }
    if (j && Array.isArray(j.data)) { out.push(...j.data); continue; }
    if (j && (j.lease || j.unit || j.property)) out.push(j);
  }
  return out;
}

function rvNum(v) {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function rvZip(v) {
  const m = String(v == null ? '' : v).match(/\b(\d{5})(?:-\d{4})?\b/);
  return m ? m[1] : null;
}

function rvDate(v) {
  const m = String(v == null ? '' : v).match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

/** One export row -> one index record, or null if it cannot price a segment. */
function rvToRecord(row) {
  if (!row || typeof row !== 'object') return null;
  const lease = row.lease || {};
  const unit = row.unit || {};
  const prop = row.property || {};
  const place = unit.address ? unit : prop;
  const zip = rvZip(place.postalCode) || rvZip(prop.postalCode) || rvZip(unit.postalCode);
  let rent = rvNum(lease.rent);
  if (!(rent > 0)) rent = rvNum(unit.rent);
  if (!zip || !(rent >= 300 && rent <= 20000)) return null;
  const sqftRaw = rvNum(unit.size != null ? unit.size : (unit.squareFeet != null ? unit.squareFeet : unit.sqft));
  const sqft = sqftRaw >= 200 && sqftRaw <= 20000 ? Math.round(sqftRaw) : null;
  const bedsRaw = rvNum(unit.beds);
  const beds = bedsRaw != null && bedsRaw >= 0 && bedsRaw <= 20 ? bedsRaw : null;
  const full = rvNum(unit.fullBaths);
  const half = rvNum(unit.halfBaths);
  const baths = full != null ? full + (half || 0) / 2 : null;
  const unitId = unit.unitID != null ? unit.unitID : lease.unitID;
  return {
    zip,
    beds,
    baths,
    sqft,
    rent: Math.round(rent),
    date: rvDate(lease.startDate),
    uid: unitId != null ? 'rv' + String(unitId) : undefined, // opaque, not the address
  };
}

/** Stable fingerprint of the records (order-independent), FNV-1a 32-bit. */
function rvDigest(records) {
  const lines = records.map((r) => [r.uid || '', r.zip, r.beds, r.baths, r.sqft, r.rent, r.date].join('|')).sort();
  let h = 0x811c9dc5;
  const s = lines.join('\n');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return ('0000000' + h.toString(16)).slice(-8) + ':' + records.length;
}

function rvBuildIndex(rows, nowIso) {
  const records = [];
  for (const row of rows) {
    const r = rvToRecord(row);
    if (r) records.push(r);
  }
  return { generatedAt: nowIso, source: 'rentvine', count: records.length, records, digest: rvDigest(records) };
}

/**
 * Decide what a trigger may do, given what is stored. Pure: returns
 * { action: 'sync'|'restore'|'ping'|'status'|'limited', reason }.
 *   trigger: 'boot' | 'schedule' | 'webhook'
 *   want (webhook only): 'ping' | 'status' | 'sync'
 */
function rvDecide(state, trigger, want, nowMs) {
  const s = state || {};
  const age = (iso) => (iso ? nowMs - Date.parse(iso) : Infinity);
  const fresh = s.index && age(s.index.generatedAt) < RV_FRESH_HOURS * 3600e3;
  if (trigger === 'boot' || trigger === 'schedule') {
    if (fresh) return { action: 'restore', reason: 'index fresh' };
    return { action: 'sync', reason: s.index ? 'index stale' : 'no index yet' };
  }
  if (want === 'status') return { action: 'status', reason: 'status' };
  if (want === 'ping') {
    if (age(s.lastPingAt) < RV_PING_MIN_SECONDS * 1e3) return { action: 'limited', reason: 'ping cached' };
    return { action: 'ping', reason: 'ping' };
  }
  if (want === 'sync') {
    if (age(s.lastSyncAttemptAt) < RV_FORCE_MIN_MINUTES * 60e3) return { action: 'limited', reason: 'sync rate limited' };
    return { action: 'sync', reason: 'forced' };
  }
  return { action: 'status', reason: 'unknown request' };
}

/** Should a freshly built index replace the stored one? */
function rvAccept(prev, next) {
  if (!next || next.count < RV_MIN_RECORDS) return { ok: false, why: 'too few records (' + (next ? next.count : 0) + ')' };
  if (prev && prev.count && next.count < prev.count * RV_MIN_KEEP_RATIO) {
    return { ok: false, why: 'shrank from ' + prev.count + ' to ' + next.count };
  }
  return { ok: true, changed: !prev || prev.digest !== next.digest };
}

/** Non-sensitive summary for webhook responses (counts and times only). */
function rvSummary(state, nowMs) {
  const s = state || {};
  const idx = s.index;
  const zips = idx ? new Set(idx.records.map((r) => r.zip)).size : 0;
  return {
    records: idx ? idx.count : 0,
    zips,
    generatedAt: idx ? idx.generatedAt : null,
    ageHours: idx ? Math.round((nowMs - Date.parse(idx.generatedAt)) / 36e5 * 10) / 10 : null,
    lastSyncAttemptAt: s.lastSyncAttemptAt || null,
    lastSyncResult: s.lastSyncResult || null,
    lastPing: s.lastPing || null,
  };
}

export {
  RV_PAGE_SIZE, RV_FRESH_HOURS, RV_FORCE_MIN_MINUTES, RV_PING_MIN_SECONDS,
  rvRows, rvToRecord, rvDigest, rvBuildIndex, rvDecide, rvAccept, rvSummary,
};
