// Build: esbuild IIFE bundle, CSS inlined as text, minified, ES2015 target.
// The 15 KB gzip budget is a build-FAILURE condition (TD-4 / S2-D1), not a
// warning.

import { build } from 'esbuild';
import { gzipSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'dist', 'embed.js');
const GZIP_BUDGET_BYTES = 15360;

const result = await build({
  entryPoints: [join(HERE, 'src', 'form.js')],
  bundle: true,
  format: 'iife',
  target: 'es2015',
  minify: true,
  write: false,
  legalComments: 'none',
  loader: { '.css': 'text' },
});

const code = result.outputFiles[0].contents;
const gzipped = gzipSync(code, { level: 9 });

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, code);

const raw = code.byteLength;
const gz = gzipped.byteLength;
console.log(`embed.js  raw=${raw} B  gzip=${gz} B  budget=${GZIP_BUDGET_BYTES} B`);

if (gz > GZIP_BUDGET_BYTES) {
  console.error(`FAIL: gzip size ${gz} B exceeds the ${GZIP_BUDGET_BYTES} B budget (S2-D1).`);
  process.exit(1);
}
console.log('size gate: PASS');
