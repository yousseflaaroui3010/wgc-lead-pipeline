// form.js <-> feature.js integration (T-brand-restyle-estimator): the
// data-layout switch in readConfig() and the branch in mount() that wraps
// `container` in the branded section chrome. Same harness shape as
// popup.test.mjs (real global document/window + css-loader-hooks bootstrap).
//
// The invariant worth a test: the chrome is built OUTSIDE `container`, so a
// state swap (form -> success/error, which replaces container.innerHTML
// wholesale) must NOT destroy the section heading or the guarantee recap.
// That is the whole reason the layout is a sibling wrapper and not part of
// formHtml(), and nothing else in the suite would catch a regression.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

let dom;
const realFetch = globalThis.fetch;

function installDom() {
  dom = new JSDOM('<!doctype html><body><div id="wgc-analysis"></div></body>', {
    url: 'https://westromgroup.com/pricing/',
  });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.CustomEvent = dom.window.CustomEvent;
  globalThis.fetch = () => Promise.reject(new Error('network disabled in test'));
}

function teardownDom() {
  delete globalThis.window;
  delete globalThis.document;
  delete globalThis.CustomEvent;
  globalThis.fetch = realFetch;
}

beforeEach(installDom);
afterEach(teardownDom);

function makeScript(attrs) {
  const script = document.createElement('script');
  Object.entries(attrs || {}).forEach(([k, v]) => script.setAttribute(k, v));
  document.body.appendChild(script);
  return script;
}

test('default layout (no data-layout): no section chrome (regression on every existing embed)', async () => {
  const { mount } = await import('../src/form.js?feat-default');
  mount(makeScript({}));
  const shadow = document.getElementById('wgc-analysis').shadowRoot;
  assert.ok(shadow.getElementById('wgc-form'), 'form still renders');
  assert.equal(shadow.querySelector('.wgc-feature'), null);
  assert.equal(shadow.querySelector('.wgc-recap'), null);
});

test('unrecognized data-layout falls back to compact rather than rendering nothing', async () => {
  const { mount } = await import('../src/form.js?feat-bogus');
  mount(makeScript({ 'data-layout': 'banana' }));
  const shadow = document.getElementById('wgc-analysis').shadowRoot;
  assert.ok(shadow.getElementById('wgc-form'));
  assert.equal(shadow.querySelector('.wgc-feature'), null);
});

test('data-layout="feature": section heading + guarantee recap wrap the form', async () => {
  const { mount } = await import('../src/form.js?feat-on');
  mount(makeScript({ 'data-layout': 'FEATURE' })); // also proves the lowercasing
  const shadow = document.getElementById('wgc-analysis').shadowRoot;

  const feature = shadow.querySelector('.wgc-feature');
  assert.ok(feature, 'feature chrome is mounted');
  assert.ok(shadow.querySelector('.wgc-sectitle'), 'section heading renders');
  assert.equal(shadow.querySelectorAll('.wgc-recap-item').length, 3, 'three recap rows');
  // The form must live INSIDE the panel grid, not beside it.
  assert.ok(shadow.querySelector('.wgc-panel-grid .wgc-wrap'), 'form card sits in the grid');
});

test('feature layout: the eviction recap row names no dollar figure (parked: $750 vs $1,000)', async () => {
  const { mount } = await import('../src/form.js?feat-evict');
  mount(makeScript({ 'data-layout': 'feature' }));
  const shadow = document.getElementById('wgc-analysis').shadowRoot;
  const text = shadow.querySelector('.wgc-recap-list').textContent;
  assert.match(text, /Eviction protection/);
  assert.doesNotMatch(text, /\$/, 'no amount until the client resolves the conflict');
});

test('feature layout: chrome survives a container state swap (the reason it is a sibling)', async () => {
  const { mount } = await import('../src/form.js?feat-swap');
  mount(makeScript({ 'data-layout': 'feature' }));
  const shadow = document.getElementById('wgc-analysis').shadowRoot;
  const wrap = shadow.querySelector('.wgc-panel-grid .wgc-wrap');

  // Simulate exactly what renderSuccess/errorPanelHtml do: blow away the
  // state container's contents.
  wrap.parentNode.innerHTML = '<div class="wgc-wrap"><h2 id="wgc-dyn-title">done</h2></div>';

  assert.ok(shadow.querySelector('.wgc-sectitle'), 'section heading survived');
  assert.equal(shadow.querySelectorAll('.wgc-recap-item').length, 3, 'recap survived');
});

test('feature layout is ignored in popup mode (the dialog brings its own chrome)', async () => {
  const { mount } = await import('../src/form.js?feat-popup');
  mount(makeScript({ 'data-mode': 'popup', 'data-layout': 'feature' }));
  const shadow = document.getElementById('wgc-analysis').shadowRoot;
  assert.ok(shadow.getElementById('wgc-launcher'), 'popup chrome wins');
  assert.equal(shadow.querySelector('.wgc-feature'), null);
});
