// form.js <-> modal.js integration (T-B1): the mode switch in readConfig()
// and the branch in mount() that either appends `container` straight to
// the shadow root (inline, today's default/unchanged behavior) or wraps it
// with createModal's launcher+dialog (popup). Needs a real global
// document/window (mount() reads document.currentScript/getElementById at
// module scope) plus the css-loader-hooks bootstrap (form.js imports
// styles.css) -- run via `node --import ./widget/test/register-hooks.mjs`.
// Pure modal a11y mechanics (focus trap, Esc, backdrop, scroll-lock) are
// already covered DOM-locally in modal.test.mjs; this file only guards the
// mode-branch wiring and the inline-mode regression.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

let dom;
const realFetch = globalThis.fetch;

function installDom() {
  dom = new JSDOM('<!doctype html><body><div id="wgc-analysis"></div></body>', {
    url: 'https://wgcassetguide.com/analysis',
  });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.CustomEvent = dom.window.CustomEvent;
  globalThis.KeyboardEvent = dom.window.KeyboardEvent;
  globalThis.MouseEvent = dom.window.MouseEvent;
  // Never let mount()'s unconditional token refresh hit the real network
  // (it already swallows failures with .catch(), so a fast rejection is
  // equivalent to an offline visitor and keeps the test hermetic/fast).
  globalThis.fetch = () => Promise.reject(new Error('network disabled in test'));
}

function teardownDom() {
  delete globalThis.window;
  delete globalThis.document;
  delete globalThis.CustomEvent;
  delete globalThis.KeyboardEvent;
  delete globalThis.MouseEvent;
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

test('inline mode (default, no data-mode): form renders directly, no launcher/overlay (regression)', async () => {
  const { mount } = await import('../src/form.js?inline-default');
  mount(makeScript({}));
  const shadow = document.getElementById('wgc-analysis').shadowRoot;
  assert.ok(shadow.getElementById('wgc-form'), 'form is rendered directly into the shadow root');
  assert.equal(shadow.getElementById('wgc-launcher'), null);
  assert.equal(shadow.getElementById('wgc-overlay'), null);
});

test('inline mode (explicit data-mode="inline"): same as default (regression)', async () => {
  const { mount } = await import('../src/form.js?inline-explicit');
  mount(makeScript({ 'data-mode': 'inline' }));
  const shadow = document.getElementById('wgc-analysis').shadowRoot;
  assert.ok(shadow.getElementById('wgc-form'));
  assert.equal(shadow.getElementById('wgc-launcher'), null);
});

test('popup mode: renders a launcher button, not the form, until opened', async () => {
  const { mount } = await import('../src/form.js?popup-launcher');
  mount(makeScript({ 'data-mode': 'popup', 'data-launch-label': 'Start My Analysis' }));
  const shadow = document.getElementById('wgc-analysis').shadowRoot;
  const launcher = shadow.getElementById('wgc-launcher');
  assert.ok(launcher, 'launcher button is rendered');
  assert.equal(launcher.textContent, 'Start My Analysis');
  assert.ok(shadow.getElementById('wgc-form'), 'form is pre-rendered (hidden) so it opens instantly');
  const overlay = shadow.getElementById('wgc-overlay');
  assert.ok(!overlay.classList.contains('wgc-open'), 'dialog starts closed');
});

test('popup mode: clicking the launcher opens the dialog around the same form', async () => {
  const { mount } = await import('../src/form.js?popup-click');
  mount(makeScript({ 'data-mode': 'popup' }));
  const shadow = document.getElementById('wgc-analysis').shadowRoot;
  const launcher = shadow.getElementById('wgc-launcher');

  launcher.click();

  const overlay = shadow.getElementById('wgc-overlay');
  const dialog = shadow.getElementById('wgc-modal');
  assert.ok(overlay.classList.contains('wgc-open'), 'dialog opens on click');
  assert.equal(dialog.getAttribute('role'), 'dialog');
  assert.equal(dialog.getAttribute('aria-modal'), 'true');
  assert.equal(dialog.getAttribute('aria-labelledby'), 'wgc-dyn-title');
  assert.ok(shadow.getElementById('wgc-form'), 'the real form is inside the dialog, not a fork');
});

test('popup mode: Esc closes the dialog and returns focus to the launcher', async () => {
  const { mount } = await import('../src/form.js?popup-esc');
  mount(makeScript({ 'data-mode': 'popup' }));
  const shadow = document.getElementById('wgc-analysis').shadowRoot;
  const launcher = shadow.getElementById('wgc-launcher');

  launcher.click();
  const dialog = shadow.getElementById('wgc-modal');
  // Esc/Tab are trapped at document level (not on `dialog`) so they keep
  // working even if a state re-render drops focus outside the dialog
  // subtree -- composed:true mirrors a real (always-composed) keydown
  // crossing the shadow boundary up to that document-level listener.
  dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));

  const overlay = shadow.getElementById('wgc-overlay');
  assert.ok(!overlay.classList.contains('wgc-open'), 'Esc closes the dialog');
  assert.equal(shadow.activeElement, launcher, 'focus returns to the launcher button');
});

test('popup mode: Tab is trapped inside the dialog (does not escape to the launcher)', async () => {
  const { mount } = await import('../src/form.js?popup-trap');
  mount(makeScript({ 'data-mode': 'popup' }));
  const shadow = document.getElementById('wgc-analysis').shadowRoot;
  const launcher = shadow.getElementById('wgc-launcher');
  launcher.click();

  const dialog = shadow.getElementById('wgc-modal');
  const closeBtn = shadow.getElementById('wgc-modal-close');
  assert.equal(shadow.activeElement, closeBtn, 'first focusable on open is the close button');

  // Shift+Tab from the first focusable must wrap to the last one inside the
  // dialog, never escape backwards to the launcher behind it.
  dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, composed: true }));
  assert.notEqual(shadow.activeElement, launcher);
  assert.ok(dialog.contains(shadow.activeElement), 'focus stays inside the dialog');
});

// Reviewer-confirmed bug, reproduced end-to-end through the real submit
// path (form.js:219 renderSuccess): the submit button held focus, the
// success re-render destroyed it, and focus fell to <body> -- outside the
// dialog -- silently breaking Esc/Tab until the user clicked back in.
// modal.test.mjs already covers this at the modal.js level directly; this
// confirms form.js's refocusContent() call sites are actually wired.
test('popup mode: a real success submit keeps Esc/focus working afterward (reviewer-reported regression)', async () => {
  globalThis.fetch = (url) => {
    if (String(url).endsWith('/token')) return Promise.resolve({ ok: true, text: () => Promise.resolve('tok123') });
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'received' }) });
  };

  const { mount } = await import('../src/form.js?popup-success-refocus');
  mount(makeScript({ 'data-mode': 'popup' }));
  const shadow = document.getElementById('wgc-analysis').shadowRoot;
  const launcher = shadow.getElementById('wgc-launcher');
  launcher.click();

  const form = shadow.getElementById('wgc-form');
  form.querySelector('#wgc-name').value = 'Jon Westrom';
  form.querySelector('#wgc-email').value = 'jon@westromgroup.com';
  form.querySelector('#wgc-phone').value = '8174451108';
  form.querySelector('#wgc-zip').value = '76052';
  form.querySelector('#wgc-sqft').value = '1850';
  shadow.getElementById('wgc-submit').focus();

  form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  // Let the tokens.ensureFresh() -> submitLead() -> renderSuccess() promise
  // chain settle (two chained fetches); a macrotask tick drains all of the
  // pending microtasks ahead of it.
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.ok(shadow.getElementById('wgc-dyn-title'), 'success content rendered inside the dialog');
  const dialog = shadow.getElementById('wgc-modal');
  assert.ok(
    dialog.contains(shadow.activeElement),
    'focus was moved back inside the dialog after the success re-render, not left outside it'
  );

  dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
  const overlay = shadow.getElementById('wgc-overlay');
  assert.ok(!overlay.classList.contains('wgc-open'), 'Esc still closes the dialog after a real success re-render');
  assert.equal(shadow.activeElement, launcher, 'focus still returns to the launcher');
});
