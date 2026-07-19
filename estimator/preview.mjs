// Quick CLI to eyeball an estimate from the real lease data — no Docker, no
// n8n. Loads the CSV directly (dev convenience).
//
// Usage: node estimator/preview.mjs <zip> [sqft] [beds]
//   e.g. node estimator/preview.mjs 76052 2000 4
//        node estimator/preview.mjs 76108 1091

import { readFileSync } from 'node:fs';
import { normalizeLeases, estimateRent } from './src/estimate.js';

const [zip, sqft, beds] = process.argv.slice(2);
if (!zip) {
  console.error('usage: node estimator/preview.mjs <zip> [sqft] [beds]');
  process.exit(1);
}

const CSV = 'data/lease-history/propertyware-active-leases-2024-2026.csv';
const leases = normalizeLeases(readFileSync(CSV, 'utf8'));
const query = { zip, sqft: sqft ? Number(sqft) : undefined, beds };
const est = estimateRent(query, leases);

const money = (n) => '$' + Math.round(n).toLocaleString('en-US');

console.log(`\nquery: ${JSON.stringify(query)}`);
if (!est) {
  console.log('=> no estimate (no comparable own-data leases). Widget would show the "received" card.\n');
  process.exit(0);
}
console.log(`\n  Estimated rent range:  ${money(est.low)} – ${money(est.high)} /mo`);
console.log(`  (tier: ${est.meta.tier}, comparable leases: ${est.meta.sampleSize}, source: ${est.meta.source})\n`);
console.log('  Recent nearby rentals (own leases):');
for (const c of est.comps) {
  const bits = [`ZIP ${c.zip}`, c.beds && `${c.beds} bd`, c.sqft && `${Number(c.sqft).toLocaleString('en-US')} sqft`, c.ago_days != null && `${c.ago_days} days ago`].filter(Boolean);
  console.log(`    - ${bits.join(' · ')}  ->  ${money(c.rent)}/mo`);
}
console.log('');
