// Test-only ESM loader hook: makes `import cssText from './styles.css'`
// work under plain node --test the same way esbuild's `loader: { '.css':
// 'text' }` (widget/build.mjs) inlines it for the shipped bundle -- default
// export of the raw file text. Never referenced by production code.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export async function load(url, context, nextLoad) {
  if (url.endsWith('.css')) {
    const text = readFileSync(fileURLToPath(url), 'utf8');
    return { format: 'module', shortCircuit: true, source: `export default ${JSON.stringify(text)};` };
  }
  return nextLoad(url, context);
}
