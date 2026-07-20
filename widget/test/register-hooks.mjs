// Bootstrap for `node --import` (stable replacement for
// --experimental-loader): registers css-loader-hooks.mjs so DOM/integration
// tests can import form.js (which imports styles.css) under plain node
// --test. Test-only; the shipped bundle never loads this file.
import { register } from 'node:module';

register('./css-loader-hooks.mjs', import.meta.url);
