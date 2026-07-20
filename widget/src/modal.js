// Popup/modal chrome (T-B1): launcher button + WCAG dialog overlay around
// the SAME form/loading/error/success rendering form.js already builds.
// This file owns only the modal chrome and focus/scroll a11y mechanics; it
// never touches the canonical form markup, validation, or payload (those
// stay in form.js / validate.js / api.js untouched).
//
// i18n note: same convention as success.js STRINGS -- no runtime i18n
// under the 15 KB gzip budget (TD-4), so user copy is centralized here as
// named constants (the swappable equivalent of message keys).
export var MODAL_STRINGS = {
  defaultLaunchLabel: 'Get My Free Rental Analysis',
  ribbon: 'Free guide included',
  close: 'Close',
};

// Elements that can receive focus. Excludes anything explicitly pulled out
// of tab order (tabindex="-1"): the honeypot input and the non-selected
// bedroom segmented-control options both use that pattern on purpose, and
// must never enter the trap's tab cycle.
var BASE_SELECTOR = 'a[href], button, input, select, textarea, [tabindex]';

export function getFocusables(container) {
  var nodes = Array.prototype.slice.call(container.querySelectorAll(BASE_SELECTOR));
  return nodes.filter(function (el) {
    if (el.hasAttribute('disabled')) return false;
    if (el.getAttribute('type') === 'hidden') return false;
    if (el.getAttribute('tabindex') === '-1') return false;
    return true;
  });
}

// Pure index math for the focus trap: given the current focusable list and
// the active element, returns the index Tab/Shift+Tab should land on. Every
// Tab press is fully JS-managed (not just boundary interception) because
// `container` content is re-rendered between states (form -> loading ->
// success/error) and native shadow-DOM tab order around that churn is not
// reliable enough to trust.
export function nextTrapIndex(list, activeEl, shiftKey) {
  if (!list.length) return -1;
  var idx = list.indexOf(activeEl);
  if (shiftKey) return idx <= 0 ? list.length - 1 : idx - 1;
  return idx === -1 || idx === list.length - 1 ? 0 : idx + 1;
}

// Builds the launcher + overlay/dialog chrome and wires open/close, the
// focus trap, Esc, backdrop click, scroll lock, and return-focus. `container`
// is the existing wgc-wrap element form.js already renders into -- it is
// moved into the dialog body verbatim, never cloned or re-templated.
export function createModal(shadow, doc, container, launchLabel) {
  var launcher = doc.createElement('button');
  launcher.type = 'button';
  launcher.className = 'wgc-launcher';
  launcher.id = 'wgc-launcher';
  launcher.textContent = launchLabel || MODAL_STRINGS.defaultLaunchLabel;

  var overlay = doc.createElement('div');
  overlay.className = 'wgc-overlay';
  overlay.id = 'wgc-overlay';

  var dialog = doc.createElement('div');
  dialog.className = 'wgc-modal';
  dialog.id = 'wgc-modal';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  // Points at the h2/h3 with id="wgc-dyn-title" that form.js/success.js
  // render as the current state's heading -- always exactly one at a time
  // since container.innerHTML is fully replaced between states.
  dialog.setAttribute('aria-labelledby', 'wgc-dyn-title');

  var header = doc.createElement('div');
  header.className = 'wgc-modal-header';

  var ribbon = doc.createElement('span');
  ribbon.className = 'wgc-modal-ribbon';
  ribbon.textContent = MODAL_STRINGS.ribbon;

  var closeBtn = doc.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'wgc-modal-close';
  closeBtn.id = 'wgc-modal-close';
  closeBtn.setAttribute('aria-label', MODAL_STRINGS.close);
  closeBtn.textContent = '×';

  var body = doc.createElement('div');
  body.className = 'wgc-modal-body';
  body.appendChild(container);

  header.appendChild(ribbon);
  header.appendChild(closeBtn);
  dialog.appendChild(header);
  dialog.appendChild(body);
  overlay.appendChild(dialog);

  var isOpen = false;
  var lastFocused = null;
  var savedOverflow = '';

  // Bound at DOCUMENT level (not on `dialog`) while open, guarded by isOpen.
  // Reason: renderSuccess/errorPanelHtml/retry all replace container's
  // innerHTML while the modal is open, destroying whatever element had
  // focus. The browser then drops focus to <body> -- OUTSIDE the dialog
  // subtree -- and a dialog-scoped keydown listener never sees the
  // bubbled event again, silently breaking Esc-close and the Tab trap
  // until the user clicks back in. keydown is composed (crosses shadow
  // boundaries), so a document-level listener still sees it regardless of
  // where focus currently sits, inside or outside the shadow root.
  function onKeydown(e) {
    if (!isOpen) return;
    if (e.key === 'Escape' || e.key === 'Esc') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      var list = getFocusables(dialog);
      if (!list.length) return;
      var idx = nextTrapIndex(list, shadow.activeElement, e.shiftKey);
      list[idx].focus();
    }
  }

  function onOverlayClick(e) {
    // Only the backdrop itself closes; a click landing on any descendant
    // (header, ribbon, form fields, close button) never bubbles as
    // target === overlay.
    if (e.target === overlay) close();
  }

  function focusFirst() {
    var list = getFocusables(dialog);
    (list[0] || closeBtn).focus();
  }

  function open() {
    if (isOpen) return;
    isOpen = true;
    lastFocused = launcher; // the only entry point to open() is this launcher's own click
    overlay.classList.add('wgc-open');
    savedOverflow = doc.body.style.overflow;
    doc.body.style.overflow = 'hidden';
    doc.addEventListener('keydown', onKeydown);
    overlay.addEventListener('click', onOverlayClick);
    focusFirst();
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    overlay.classList.remove('wgc-open');
    doc.body.style.overflow = savedOverflow;
    doc.removeEventListener('keydown', onKeydown);
    overlay.removeEventListener('click', onOverlayClick);
    if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
  }

  // Called by form.js after each popup-mode re-render of `container`
  // (success/error/retry) so a keyboard user is never left focused on
  // <body>. No-ops while closed (the pre-open initial renderForm() at
  // mount time must not steal focus into a hidden dialog).
  function refocusContent() {
    if (!isOpen) return;
    focusFirst();
  }

  launcher.addEventListener('click', open);
  closeBtn.addEventListener('click', close);

  return {
    launcher: launcher,
    overlay: overlay,
    dialog: dialog,
    open: open,
    close: close,
    refocusContent: refocusContent,
  };
}
