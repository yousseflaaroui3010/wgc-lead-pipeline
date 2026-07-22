// Entry point (form v2, 2026-07-16). Mounts the rental-analysis form into an
// open Shadow DOM (TD-1) on #wgc-analysis, configured via data- attributes on
// the script tag (TD-2). No secrets, no PII persistence, zero runtime deps
// (TD-4). Four states: empty (the form), loading, error, success.

import cssText from './styles.css';
import { validateAll } from './validate.js';
import {
  createTokenStore,
  newSubmissionId,
  buildPayload,
  submitLead,
  DEFAULT_API_BASE,
} from './api.js';
import { STRINGS, buildSuccessHtml, escapeHtml } from './success.js';
import { createModal } from './modal.js';

var MOUNT_ID = 'wgc-analysis';
var BEDROOM_OPTIONS = ['2', '3', '4', '5+'];

// Estimate-first (2026-07-22): the property fields alone drive the instant
// estimate, so the form asks ONLY for zip + square footage (+ optional
// bedrooms). No name/email/phone wall. Email is collected later, and only if
// the visitor ticks the ebook consent box (which reveals FIELDS.email).
var FIELDS = {
  zip: { name: 'zip', label: 'ZIP code', type: 'text', required: true, autocomplete: 'postal-code', maxlength: 5, inputmode: 'numeric', placeholder: 'e.g. 76052' },
  sqft: { name: 'sqft', label: 'Square footage', type: 'text', required: true, maxlength: 6, inputmode: 'numeric', placeholder: 'approximate is fine' },
  // required:false -> no HTML `required` attr; validateAll makes it required
  // ONLY when consent is checked, and wireConsent toggles aria-required.
  email: { name: 'email', label: 'Email', type: 'email', required: false, autocomplete: 'email', maxlength: 254, placeholder: 'you@email.com' },
};

function fieldHtml(f) {
  return (
    '<div class="wgc-field">' +
    '<label class="wgc-label" for="wgc-' + f.name + '">' + escapeHtml(f.label) + '</label>' +
    '<input class="wgc-input" id="wgc-' + f.name + '" name="' + f.name + '"' +
    ' type="' + f.type + '" maxlength="' + f.maxlength + '"' +
    (f.inputmode ? ' inputmode="' + f.inputmode + '"' : '') +
    (f.placeholder ? ' placeholder="' + escapeHtml(f.placeholder) + '"' : '') +
    (f.autocomplete ? ' autocomplete="' + f.autocomplete + '"' : '') +
    (f.required ? ' required aria-required="true"' : '') +
    ' aria-describedby="wgc-err-' + f.name + '">' +
    '<span class="wgc-err" id="wgc-err-' + f.name + '" aria-live="polite"></span>' +
    '</div>'
  );
}

function bedroomsHtml() {
  var opts = BEDROOM_OPTIONS.map(function (v, i) {
    return (
      '<button type="button" class="wgc-seg-opt" role="radio" aria-checked="false"' +
      ' data-value="' + escapeHtml(v) + '" tabindex="' + (i === 0 ? '0' : '-1') + '">' +
      escapeHtml(v) + '</button>'
    );
  }).join('');
  return (
    '<div class="wgc-field">' +
    '<span class="wgc-label" id="wgc-bedrooms-label">Bedrooms (optional)</span>' +
    '<div class="wgc-seg" role="radiogroup" aria-labelledby="wgc-bedrooms-label"' +
    ' aria-describedby="wgc-err-bedrooms">' + opts + '</div>' +
    '<span class="wgc-err" id="wgc-err-bedrooms" aria-live="polite"></span>' +
    '</div>'
  );
}

function formHtml(cfg) {
  var rows =
    '<div class="wgc-row">' + fieldHtml(FIELDS.zip) + fieldHtml(FIELDS.sqft) + '</div>' +
    bedroomsHtml();
  return (
    '<div class="wgc-wrap">' +
    '<h2 class="wgc-title" id="wgc-dyn-title">Free Rent Estimate</h2>' +
    '<p class="wgc-sub">Enter your property details for an instant estimated rent range. No email required.</p>' +
    '<p class="wgc-status" id="wgc-status" role="status" aria-live="polite"></p>' +
    '<form id="wgc-form" novalidate>' +
    rows +
    // Ebook opt-in = the EXPLICIT consent to be contacted. Unchecked never
    // blocks the estimate; checking it reveals the email field below and is
    // the only way we collect contact info (estimate-first, 2026-07-22).
    '<div class="wgc-check">' +
    '<input type="checkbox" id="wgc-ebook" name="ebook_opt_in"' +
    ' aria-controls="wgc-ebook-reveal" aria-expanded="false">' +
    '<label for="wgc-ebook">' + escapeHtml(STRINGS.ebookLabel) + '</label>' +
    '</div>' +
    // Email reveal: hidden until the consent box is checked.
    '<div class="wgc-reveal" id="wgc-ebook-reveal" hidden>' +
    fieldHtml(FIELDS.email) +
    '</div>' +
    // Honeypot (bot defense). Named "fax" on purpose: bots fill plausible
    // fields, but browser autofill profiles do NOT store a fax number —
    // "company" got autofilled by real users' browsers and silently
    // bot-rejected them (found in prod testing 2026-07-19).
    '<div class="wgc-hp" aria-hidden="true">' +
    '<label for="wgc-fax">Fax number</label>' +
    '<input id="wgc-fax" name="fax" type="text" tabindex="-1" autocomplete="off">' +
    '</div>' +
    '<button class="wgc-btn" type="submit" id="wgc-submit">Get My Estimate</button>' +
    '<a class="wgc-privacy wgc-link" href="' + escapeHtml(cfg.privacyUrl) +
    '" target="_blank" rel="noopener">Privacy Policy</a>' +
    '</form>' +
    '</div>'
  );
}

function errorPanelHtml(cfg) {
  return (
    '<div class="wgc-wrap"><div class="wgc-panel" role="alert" aria-live="assertive">' +
    '<h2 class="wgc-title" id="wgc-dyn-title">Something went wrong</h2>' +
    '<p class="wgc-sub">Your request was not sent. Please try again, or use our ' +
    '<a class="wgc-link" href="' + escapeHtml(cfg.fallbackUrl) + '">rental analysis page</a>.</p>' +
    '<button class="wgc-btn" id="wgc-retry" type="button">Try again</button>' +
    '</div></div>'
  );
}

function readConfig(script) {
  var endpoint = script.getAttribute('data-endpoint') || DEFAULT_API_BASE;
  var mode = (script.getAttribute('data-mode') || 'inline').toLowerCase();
  return {
    endpoint: endpoint.replace(/\/+$/, ''),
    source: script.getAttribute('data-source') || 'Website - wgcassetguide',
    privacyUrl: script.getAttribute('data-privacy-url') || 'https://wgcassetguide.com/privacy',
    fallbackUrl: script.getAttribute('data-fallback-url') || 'https://wgcassetguide.com/analysis',
    // Unrecognized values fall back to today's default (inline) rather than
    // silently rendering nothing.
    mode: mode === 'popup' ? 'popup' : 'inline',
    launchLabel: script.getAttribute('data-launch-label') || null,
  };
}

function dispatchDelivered(host, cfg, submissionId) {
  // FR-7: no PII in the detail, composed so it crosses the shadow boundary.
  var detail = { source: cfg.source, submission_id: submissionId };
  host.dispatchEvent(new CustomEvent('wgc-lead-submitted', { bubbles: true, composed: true, detail: detail }));
  window.dispatchEvent(new CustomEvent('wgc-lead-submitted', { detail: detail }));
  if (Array.isArray(window.dataLayer)) {
    window.dataLayer.push({ event: 'wgc_lead_submitted', source: cfg.source, submission_id: submissionId });
  }
}

function showFieldErrors(root, errors) {
  var firstBad = null;
  ['zip', 'sqft', 'bedrooms', 'email'].forEach(function (name) {
    var input = root.querySelector('[name="' + name + '"]');
    var err = root.getElementById('wgc-err-' + name);
    var msg = errors[name] || '';
    if (err) err.textContent = msg;
    if (input) input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    if (msg && !firstBad) firstBad = input || root.querySelector('.wgc-seg [data-value]');
  });
  if (firstBad && typeof firstBad.focus === 'function') firstBad.focus();
}

export function mount(script) {
  if (!script) return;
  var cfg = readConfig(script);
  var host = document.getElementById(MOUNT_ID);
  if (!host || host.shadowRoot) return;

  var mountTime = Date.now(); // basis for fill_ms (client-measured fill time)
  var shadow = host.attachShadow({ mode: 'open' }); // TD-1: open, testable
  var style = document.createElement('style');
  style.textContent = cssText;
  var container = document.createElement('div');
  shadow.appendChild(style);

  // Popup mode: form/loading/error/success render into `container` exactly
  // as inline mode does (renderForm/renderSuccess/errorPanelHtml below are
  // untouched and mode-agnostic) -- createModal only moves that same node
  // inside a WCAG dialog and adds a launcher button in front of it.
  if (cfg.mode === 'popup') {
    var modal = createModal(shadow, document, container, cfg.launchLabel);
    shadow.appendChild(modal.launcher);
    shadow.appendChild(modal.overlay);
  } else {
    shadow.appendChild(container);
  }

  var tokens = createTokenStore(cfg.endpoint);
  tokens.refresh().catch(function () { /* retried on interaction + submit */ });

  var submissionId = null; // stable across retries so server dedupe holds
  var bedrooms = '';       // segmented selection ('' = skipped)
  var submitting = false;

  function wireBedrooms(form) {
    var group = form.querySelector('.wgc-seg');
    if (!group) return;
    var opts = Array.prototype.slice.call(group.querySelectorAll('[data-value]'));
    function select(el) {
      bedrooms = el.getAttribute('data-value');
      opts.forEach(function (o) {
        var on = o === el;
        o.setAttribute('aria-checked', on ? 'true' : 'false');
        o.setAttribute('tabindex', on ? '0' : '-1');
      });
    }
    opts.forEach(function (el, idx) {
      el.addEventListener('click', function () { select(el); el.focus(); });
      el.addEventListener('keydown', function (e) {
        var next = -1;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % opts.length;
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (idx - 1 + opts.length) % opts.length;
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = opts.length - 1;
        else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); select(el); return; }
        if (next >= 0) { e.preventDefault(); select(opts[next]); opts[next].focus(); }
      });
    });
  }

  function collectFields(form) {
    function val(name) {
      var el = form.querySelector('[name="' + name + '"]');
      return el ? el.value : '';
    }
    var box = form.querySelector('#wgc-ebook');
    return {
      zip: val('zip'), sqft: val('sqft'), bedrooms: bedrooms,
      email: val('email'), ebook_opt_in: !!(box && box.checked),
    };
  }

  // Consent checkbox toggles the email reveal and email's required state. An
  // un-check clears the field + its error so a stale value never submits.
  function wireConsent(form) {
    var box = form.querySelector('#wgc-ebook');
    var reveal = form.querySelector('#wgc-ebook-reveal');
    var email = form.querySelector('[name="email"]');
    if (!box || !reveal) return;
    box.addEventListener('change', function () {
      var on = box.checked;
      if (on) reveal.removeAttribute('hidden');
      else reveal.setAttribute('hidden', '');
      box.setAttribute('aria-expanded', on ? 'true' : 'false');
      if (!email) return;
      email.setAttribute('aria-required', on ? 'true' : 'false');
      if (on) {
        email.focus();
      } else {
        email.value = '';
        email.setAttribute('aria-invalid', 'false');
        var err = form.querySelector('#wgc-err-email');
        if (err) err.textContent = '';
      }
    });
  }

  function renderSuccess(resp, opts) {
    container.innerHTML = '<div class="wgc-wrap">' + buildSuccessHtml(resp, opts) + '</div>';
    var cta = shadow.getElementById('wgc-cta');
    if (cta) {
      cta.addEventListener('click', function () {
        var thanks = shadow.getElementById('wgc-thanks');
        if (thanks) thanks.removeAttribute('hidden');
        cta.setAttribute('hidden', '');
        if (thanks) thanks.focus();
      });
    }
    // Popup mode: the submit button that held focus was just destroyed by
    // the innerHTML swap above; put focus back inside the dialog (no-ops
    // in inline mode / while the dialog is closed).
    if (modal) modal.refocusContent();
  }

  function renderForm() {
    container.innerHTML = formHtml(cfg);
    var form = shadow.getElementById('wgc-form');
    var btn = shadow.getElementById('wgc-submit');
    var status = shadow.getElementById('wgc-status');

    wireBedrooms(form);
    wireConsent(form);
    form.addEventListener('focusin', function () { tokens.ensureFresh(); });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (submitting) return; // double-submit guard

      var checked = validateAll(collectFields(form));
      if (!checked.ok) {
        showFieldErrors(shadow, checked.errors);
        status.textContent = 'Please fix the highlighted fields.';
        status.setAttribute('data-kind', 'error');
        return;
      }
      showFieldErrors(shadow, {});
      // Opted in = consent box ticked AND a valid email captured. Only then is
      // any contact info sent, and only then does WF-2 (guide + team) run.
      var optedIn = checked.data.ebook_opt_in === true && !!checked.data.email;

      if (!submissionId) submissionId = newSubmissionId();
      var payload = buildPayload(checked.data, { submissionId: submissionId });
      var extras = {
        token: tokens.get() || '',
        honeypot: shadow.getElementById('wgc-fax').value,
        fillMs: Date.now() - mountTime,
      };

      submitting = true;
      btn.disabled = true;
      status.removeAttribute('data-kind');
      status.textContent = 'Getting your estimate…';

      tokens
        .ensureFresh()
        .then(function (token) { extras.token = token || ''; return submitLead(cfg.endpoint, payload, extras); })
        .then(function (resp) {
          renderSuccess(resp, { ebookOptIn: optedIn, zip: checked.data.zip });
          // A lead only exists when the visitor opted in; an estimate-only
          // view is not a lead and must not fire the delivered event.
          if (optedIn) dispatchDelivered(host, cfg, submissionId);
        })
        .catch(function () {
          submitting = false;
          container.innerHTML = errorPanelHtml(cfg);
          // Popup mode: same reason as renderSuccess above -- the submit
          // button that held focus is gone.
          if (modal) modal.refocusContent();
          var retry = shadow.getElementById('wgc-retry');
          if (retry) retry.addEventListener('click', function () {
            submitting = false;
            renderForm();
            // Popup mode: renderForm() just replaced the retry button too.
            if (modal) modal.refocusContent();
          });
        });
    });
  }

  renderForm();
}

// The async script can execute before the mount div has parsed, and
// document.currentScript is only valid during initial evaluation — capture
// it now and defer mounting until the DOM is ready.
var SCRIPT = document.currentScript;
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function () { mount(SCRIPT); });
} else {
  mount(SCRIPT);
}
