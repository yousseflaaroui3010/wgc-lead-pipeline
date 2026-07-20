// Automated a11y sweep (axe-core) over the real mounted widget, both modes.
// axe-core traverses open shadow roots natively, so this checks the actual
// shadow-scoped markup form.js/modal.js produce -- role/aria wiring, labels,
// and color contrast for the approved navy/red/amber palette -- not just
// hand-asserted attributes. Dev-only dependency (jsdom + axe-core), never
// shipped in embed.js; see DECISIONS for the T-B1 rationale.
//
// One JSDOM realm is reused for the whole file (reset per test via
// body.innerHTML) rather than a fresh `new JSDOM()` per test: axe-core
// caches constructor references (Node/Element/etc.) from the first
// window/document it runs against, and a document from a *different* JSDOM
// realm later fails its internal instanceof checks ("axe.run arguments are
// invalid"). Same reason axe-core is imported dynamically, after globals
// are installed, instead of statically at module top.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const realFetch = globalThis.fetch;
const realNavigator = globalThis.navigator;
let dom;
let axe;

// The "region" rule (all page content must sit in a landmark) and the
// document-level lang/title rules are about the HOST PAGE's own structure,
// not something an embedded third-party widget can own -- same reasoning
// WordPress-embedded widgets always disclaim. Everything else stays on,
// including color-contrast for the navy/red/amber palette.
const AXE_OPTIONS = { rules: { region: { enabled: false } } };

before(async () => {
  dom = new JSDOM('<!doctype html><html lang="en"><head><title>Free Rental Analysis</title></head><body></body></html>', {
    url: 'https://wgcassetguide.com/analysis',
    pretendToBeVisual: true,
  });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.CustomEvent = dom.window.CustomEvent;
  Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
  globalThis.fetch = () => Promise.reject(new Error('network disabled in test'));
  axe = (await import('axe-core')).default;
});

after(() => {
  delete globalThis.window;
  delete globalThis.document;
  delete globalThis.CustomEvent;
  Object.defineProperty(globalThis, 'navigator', { value: realNavigator, configurable: true });
  globalThis.fetch = realFetch;
});

beforeEach(() => {
  dom.window.document.body.innerHTML = '<div id="wgc-analysis"></div>';
});

function makeScript(attrs) {
  const script = document.createElement('script');
  Object.entries(attrs || {}).forEach(([k, v]) => script.setAttribute(k, v));
  document.body.appendChild(script);
  return script;
}

function summarize(results) {
  return results.violations
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.length} node(s) [${v.nodes.map((n) => n.target.join(' ')).join(', ')}]`)
    .join('; ');
}

test('axe: inline mode form is clean', async () => {
  const { mount } = await import('../src/form.js?axe-inline');
  mount(makeScript({}));
  const results = await axe.run(dom.window.document, AXE_OPTIONS);
  assert.equal(results.violations.length, 0, summarize(results));
});

test('axe: popup mode, launcher-only (dialog closed) is clean', async () => {
  const { mount } = await import('../src/form.js?axe-popup-closed');
  mount(makeScript({ 'data-mode': 'popup' }));
  const results = await axe.run(dom.window.document, AXE_OPTIONS);
  assert.equal(results.violations.length, 0, summarize(results));
});

test('axe: popup mode, dialog open (role=dialog, labelled, focus trapped) is clean', async () => {
  const { mount } = await import('../src/form.js?axe-popup-open');
  mount(makeScript({ 'data-mode': 'popup' }));
  const shadow = document.getElementById('wgc-analysis').shadowRoot;
  shadow.getElementById('wgc-launcher').click();
  const results = await axe.run(dom.window.document, AXE_OPTIONS);
  assert.equal(results.violations.length, 0, summarize(results));
});
