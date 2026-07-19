// Build the deployable segment index from the (gitignored) lease CSV.
//
// The n8n runtime never reads the raw CSV; it loads this compact JSON, which
// carries ONLY the fields the estimator needs — zip, beds, baths, sqft, rent,
// lease date, type. No unit address, no city, no tenant data => no PII, and
// (like the CSV) it stays OUT of git: it is client business data. It is mounted
// into the n8n container the same way infra/.env and leadsimple-map.json are.
//
// Usage: node estimator/build-index.mjs [inputCsv] [outputJson]
//   defaults: data/lease-history/propertyware-active-leases-2024-2026.csv
//             estimator/dist/segment-index.json

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { normalizeLeases } from './src/estimate.js';

const inCsv = process.argv[2] || 'data/lease-history/propertyware-active-leases-2024-2026.csv';
const outJson = process.argv[3] || 'estimator/dist/segment-index.json';

const leases = normalizeLeases(readFileSync(inCsv, 'utf8'));

// Compact record: short-lived keys keep the mounted file small. `date` is ISO
// (loadIndex rehydrates it). Drop address/city entirely.
const records = leases.map((l) => ({
  zip: l.zip,
  beds: l.beds,
  baths: l.baths,
  sqft: l.sqft,
  rent: l.rent,
  date: l.startDate ? l.startDate.toISOString().slice(0, 10) : null,
  type: l.type || undefined,
}));

const index = {
  generatedAt: new Date().toISOString(),
  source: inCsv.split(/[\\/]/).pop(),
  count: records.length,
  records,
};

mkdirSync(dirname(outJson), { recursive: true });
writeFileSync(outJson, JSON.stringify(index));

const zips = new Set(records.map((r) => r.zip)).size;
console.log(`segment-index: ${records.length} leases across ${zips} zips -> ${outJson}`);
