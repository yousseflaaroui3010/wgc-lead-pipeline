// Modal chrome + a11y mechanics (T-B1). Uses a local jsdom instance built
// directly with the DOM APIs modal.js already takes as parameters (shadow,
// doc, container) -- no global patching needed here, and no dependency on
// the css-loader-hooks/register-hooks bootstrap (modal.js never imports
// styles.css). The form.js<->modal.js integration (mode switch, launcher
// wiring against the real mount()) is covered separately in popup.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { getFocusables, nextTrapIndex, createModal, MODAL_STRINGS } from '../src/modal.js';

function makeFixture() {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://wgcassetguide.com/' });
  const doc = dom.window.document;
  const host = doc.createElement('div');
  doc.body.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });

  // Mirrors the real form markup's focusable shape closely enough to
  // exercise the trap honestly: a normal input, the honeypot (tabindex=-1,
  // must be excluded), and a submit button.
  const container = doc.createElement('div');
  container.className = 'wgc-wrap';
  container.innerHTML =
    '<h2 id="wgc-dyn-title">Free Rental Analysis</h2>' +
    '<input id="wgc-name" type="text">' +
    '<input id="wgc-fax" type="text" tabindex="-1">' +
    '<button id="wgc-submit" type="submit">Get My Free Analysis</button>';

  return { dom, doc, host, shadow, container };
}

test('nextTrapIndex: pure boundary wrap logic (no DOM)', () => {
  const list = ['a', 'b', 'c'];
  assert.equal(nextTrapIndex(list, 'c', false), 0); // Tab past last -> first
  assert.equal(nextTrapIndex(list, 'a', true), 2);  // Shift+Tab before first -> last
  assert.equal(nextTrapIndex(list, 'a', false), 1); // Tab from middle-ish -> next
  assert.equal(nextTrapIndex(list, 'b', true), 0);  // Shift+Tab -> prev
  assert.equal(nextTrapIndex(list, 'not-in-list', false), 0);
  assert.equal(nextTrapIndex([], 'x', false), -1);
});

test('getFocusables: excludes tabindex=-1 (honeypot) and disabled elements', () => {
  const { doc } = makeFixture();
  const box = doc.createElement('div');
  box.innerHTML =
    '<input id="a">' +
    '<input id="hp" tabindex="-1">' +
    '<button id="b" disabled>x</button>' +
    '<button id="c">y</button>' +
    '<input type="hidden" id="d">';
  const ids = getFocusables(box).map((el) => el.id);
  assert.deepEqual(ids, ['a', 'c']);
});

test('createModal: open moves focus to the close button (first focusable)', () => {
  const { doc, shadow, container } = makeFixture();
  const modal = createModal(shadow, doc, container, null);
  shadow.appendChild(modal.launcher);
  shadow.appendChild(modal.overlay);
  modal.open();
  assert.equal(shadow.activeElement && shadow.activeElement.id, 'wgc-modal-close');
  assert.ok(modal.overlay.classList.contains('wgc-open'));
});

test('createModal: launcher uses data-launch-label, else the default copy', () => {
  const { doc, shadow, container } = makeFixture();
  const withLabel = createModal(shadow, doc, container, 'Custom label');
  assert.equal(withLabel.launcher.textContent, 'Custom label');

  const fixture2 = makeFixture();
  const withDefault = createModal(fixture2.shadow, fixture2.doc, fixture2.container, null);
  assert.equal(withDefault.launcher.textContent, MODAL_STRINGS.defaultLaunchLabel);
});

test('createModal: Esc closes and returns focus to the launcher', () => {
  const { doc, shadow, container } = makeFixture();
  const modal = createModal(shadow, doc, container, null);
  shadow.appendChild(modal.launcher);
  shadow.appendChild(modal.overlay);
  modal.launcher.focus();
  modal.open();
  assert.notEqual(shadow.activeElement, modal.launcher);

  const esc = new doc.defaultView.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true });
  modal.dialog.dispatchEvent(esc);

  assert.ok(!modal.overlay.classList.contains('wgc-open'));
  assert.equal(shadow.activeElement, modal.launcher, 'focus returns to the launcher on Esc');
});

test('createModal: Tab and Shift+Tab cycle within the dialog (close btn <-> name <-> submit)', () => {
  const { doc, shadow, container } = makeFixture();
  const modal = createModal(shadow, doc, container, null);
  shadow.appendChild(modal.launcher);
  shadow.appendChild(modal.overlay);
  modal.open(); // focus starts on close button

  function tab(shiftKey) {
    const e = new doc.defaultView.KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true, composed: true });
    modal.dialog.dispatchEvent(e);
    return e.defaultPrevented;
  }

  assert.equal(shadow.activeElement.id, 'wgc-modal-close');
  assert.ok(tab(false));
  assert.equal(shadow.activeElement.id, 'wgc-name');
  tab(false);
  assert.equal(shadow.activeElement.id, 'wgc-submit');
  tab(false); // wraps past the last focusable back to the first
  assert.equal(shadow.activeElement.id, 'wgc-modal-close');
  tab(true); // Shift+Tab from first wraps to last
  assert.equal(shadow.activeElement.id, 'wgc-submit');
  // The honeypot (tabindex=-1) must never be a stop in either direction.
});

test('createModal: backdrop click closes, dialog-panel click does not', () => {
  const { doc, shadow, container } = makeFixture();
  const modal = createModal(shadow, doc, container, null);
  shadow.appendChild(modal.launcher);
  shadow.appendChild(modal.overlay);
  modal.open();

  const innerClick = new doc.defaultView.MouseEvent('click', { bubbles: true });
  modal.dialog.dispatchEvent(innerClick);
  assert.ok(modal.overlay.classList.contains('wgc-open'), 'click inside the panel does not close it');

  const backdropClick = new doc.defaultView.MouseEvent('click', { bubbles: true });
  modal.overlay.dispatchEvent(backdropClick);
  assert.ok(!modal.overlay.classList.contains('wgc-open'), 'click on the backdrop itself closes it');
});

test('createModal: body scroll-locked while open, restored (incl. a pre-existing inline value) on close', () => {
  const { doc, shadow, container } = makeFixture();
  doc.body.style.overflow = 'auto'; // simulate a host page that already set this inline
  const modal = createModal(shadow, doc, container, null);
  shadow.appendChild(modal.launcher);
  shadow.appendChild(modal.overlay);

  modal.open();
  assert.equal(doc.body.style.overflow, 'hidden');
  modal.close();
  assert.equal(doc.body.style.overflow, 'auto', 'restores the exact pre-open inline value, not a hardcoded default');
});

// Reviewer-confirmed bug (post-review fix): a state re-render (success,
// error, retry) replaces container.innerHTML while the dialog is open,
// destroying whatever element held focus. The browser then drops focus to
// <body> -- outside the dialog subtree entirely. Before the fix, Esc/Tab
// were bound on `dialog`, so a bubbled keydown from <body> never reached
// them and both silently stopped working. Reproduce that exact sequence
// here without going through form.js.
test('createModal: after an in-place re-render steals focus to <body>, Esc still closes and Tab still traps', () => {
  const { doc, shadow, container } = makeFixture();
  const modal = createModal(shadow, doc, container, null);
  shadow.appendChild(modal.launcher);
  shadow.appendChild(modal.overlay);
  modal.open();
  assert.equal(shadow.activeElement.id, 'wgc-modal-close');

  // Move focus to a control INSIDE container (as it would be at real
  // submit time -- the user tabbed to #wgc-submit and hit it), not the
  // close button (which lives in the header, outside container, and would
  // survive the innerHTML swap below untouched).
  shadow.getElementById('wgc-submit').focus();
  assert.equal(shadow.activeElement.id, 'wgc-submit');

  // Simulate the state swap: the focused control disappears, the way
  // renderSuccess()/errorPanelHtml()/renderForm() replace container's
  // innerHTML in form.js.
  container.innerHTML = '<h2 id="wgc-dyn-title">Request received</h2><p>Thanks.</p>';
  // The close button that held focus no longer exists; nothing inside the
  // shadow tree is focused anymore (focus fell out of the dialog subtree
  // entirely -- exactly the state a dialog-scoped keydown listener misses).
  assert.ok(!shadow.activeElement || !modal.dialog.contains(shadow.activeElement));

  // Tab must still be trapped even though focus is currently outside the
  // dialog subtree (document-level listener, not dialog-scoped).
  const tab = new doc.defaultView.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, composed: true });
  doc.body.dispatchEvent(tab);
  assert.ok(modal.dialog.contains(shadow.activeElement), 'Tab redirects focus back inside the dialog, not left on <body>');

  // Esc must still close the dialog and return focus to the launcher.
  const esc = new doc.defaultView.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true });
  doc.body.dispatchEvent(esc);
  assert.ok(!modal.overlay.classList.contains('wgc-open'), 'Esc still closes the dialog after a re-render');
  assert.equal(shadow.activeElement, modal.launcher, 'focus still returns to the launcher');
});

test('createModal: refocusContent() puts focus back inside the dialog after a re-render, and no-ops while closed', () => {
  const { doc, shadow, container } = makeFixture();
  const modal = createModal(shadow, doc, container, null);
  shadow.appendChild(modal.launcher);
  shadow.appendChild(modal.overlay);

  // Closed: must not steal focus into a hidden dialog (e.g. form.js's
  // initial pre-render at mount time, before the user has opened it).
  modal.refocusContent();
  assert.notEqual(shadow.activeElement, shadow.getElementById('wgc-modal-close'));

  modal.open();
  container.innerHTML = '<h2 id="wgc-dyn-title">Request received</h2>';
  modal.refocusContent();
  assert.equal(shadow.activeElement.id, 'wgc-modal-close', 'falls back to the close button when the new content has no other focusable');
});
