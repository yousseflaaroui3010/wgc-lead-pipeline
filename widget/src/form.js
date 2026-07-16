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

var MOUNT_ID = 'wgc-analysis';
var BEDROOM_OPTIONS = ['2', '3', '4', '5+'];

// Text/number inputs. Bedrooms (segmented) and the ebook checkbox are
// rendered separately below.
var FIELDS = [
  { name: 'name', label: 'Name', type: 'text', required: true, autocomplete: 'name', maxlength: 120, half: false },
  { name: 'email', label: 'Email', type: 'email', required: true, autocomplete: 'email', maxlength: 254, half: false },
  { name: 'phone', label: 'Phone', type: 'tel', required: true, autocomplete: 'tel', maxlength: 20, half: false },
  { name: 'zip', label: 'ZIP code', type: 'text', required: true, autocomplete: 'postal-code', maxlength: 5, half: true, inputmode: 'numeric' },
  { name: 'sqft', label: 'Square footage', type: 'text', required: true, maxlength: 6, half: true, inputmode: 'numeric', placeholder: 'approximate is fine' },
];

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
    fieldHtml(FIELDS[0]) + fieldHtml(FIELDS[1]) + fieldHtml(FIELDS[2]) +
    '<div class="wgc-row">' + fieldHtml(FIELDS[3]) + fieldHtml(FIELDS[4]) + '</div>' +
    bedroomsHtml();
  return (
    '<div class="wgc-wrap">' +
    '<h2 class="wgc-title">Free Rental Analysis</h2>' +
    '<p class="wgc-sub">Tell us about your property and the Westrom team will prepare your analysis.</p>' +
    '<p class="wgc-status" id="wgc-status" role="status" aria-live="polite"></p>' +
    '<form id="wgc-form" novalidate>' +
    rows +
    // Ebook opt-in: unchecked, never blocks submission (#7).
    '<div class="wgc-check">' +
    '<input type="checkbox" id="wgc-ebook" name="ebook_opt_in">' +
    '<label for="wgc-ebook">' + escapeHtml(STRINGS.ebookLabel) + '</label>' +
    '</div>' +
    // Honeypot (bot defense), unchanged: real users never see or tab into it.
    '<div class="wgc-hp" aria-hidden="true">' +
    '<label for="wgc-company">Company</label>' +
    '<input id="wgc-company" name="company" type="text" tabindex="-1" autocomplete="off">' +
    '</div>' +
    '<button class="wgc-btn" type="submit" id="wgc-submit">Get My Free Analysis</button>' +
    // Implied-consent fine print under the submit button (#8).
    '<p class="wgc-fineprint">' + escapeHtml(STRINGS.finePrint) + '</p>' +
    '<a class="wgc-privacy wgc-link" href="' + escapeHtml(cfg.privacyUrl) +
    '" target="_blank" rel="noopener">Privacy Policy</a>' +
    '</form>' +
    '</div>'
  );
}

function errorPanelHtml(cfg) {
  return (
    '<div class="wgc-wrap"><div class="wgc-panel" role="alert" aria-live="assertive">' +
    '<h2 class="wgc-title">Something went wrong</h2>' +
    '<p class="wgc-sub">Your request was not sent. Please try again, or use our ' +
    '<a class="wgc-link" href="' + escapeHtml(cfg.fallbackUrl) + '">rental analysis page</a>.</p>' +
    '<button class="wgc-btn" id="wgc-retry" type="button">Try again</button>' +
    '</div></div>'
  );
}

function readConfig(script) {
  var endpoint = script.getAttribute('data-endpoint') || DEFAULT_API_BASE;
  return {
    endpoint: endpoint.replace(/\/+$/, ''),
    source: script.getAttribute('data-source') || 'Website - wgcassetguide',
    privacyUrl: script.getAttribute('data-privacy-url') || 'https://wgcassetguide.com/privacy',
    fallbackUrl: script.getAttribute('data-fallback-url') || 'https://wgcassetguide.com/analysis',
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
  ['name', 'email', 'phone', 'zip', 'sqft', 'bedrooms'].forEach(function (name) {
    var input = root.querySelector('[name="' + name + '"]');
    var err = root.getElementById('wgc-err-' + name);
    var msg = errors[name] || '';
    if (err) err.textContent = msg;
    if (input) input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    if (msg && !firstBad) firstBad = input || root.querySelector('.wgc-seg [data-value]');
  });
  if (firstBad && typeof firstBad.focus === 'function') firstBad.focus();
}

function mount(script) {
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
  shadow.appendChild(container);

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
    return {
      name: val('name'), email: val('email'), phone: val('phone'),
      zip: val('zip'), sqft: val('sqft'), bedrooms: bedrooms,
    };
  }

  function renderSuccess(resp, ebookOptIn) {
    container.innerHTML = '<div class="wgc-wrap">' + buildSuccessHtml(resp, { ebookOptIn: ebookOptIn }) + '</div>';
    var cta = shadow.getElementById('wgc-cta');
    if (cta) {
      cta.addEventListener('click', function () {
        var thanks = shadow.getElementById('wgc-thanks');
        if (thanks) thanks.removeAttribute('hidden');
        cta.setAttribute('hidden', '');
        if (thanks) thanks.focus();
      });
    }
  }

  function renderForm() {
    container.innerHTML = formHtml(cfg);
    var form = shadow.getElementById('wgc-form');
    var btn = shadow.getElementById('wgc-submit');
    var status = shadow.getElementById('wgc-status');

    wireBedrooms(form);
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
      var ebookOptIn = shadow.getElementById('wgc-ebook').checked;
      checked.data.ebook_opt_in = ebookOptIn;

      if (!submissionId) submissionId = newSubmissionId();
      var payload = buildPayload(checked.data, { submissionId: submissionId });
      var extras = {
        token: tokens.get() || '',
        honeypot: shadow.getElementById('wgc-company').value,
        fillMs: Date.now() - mountTime,
      };

      submitting = true;
      btn.disabled = true;
      status.removeAttribute('data-kind');
      status.textContent = 'Sending your request…';

      tokens
        .ensureFresh()
        .then(function (token) { extras.token = token || ''; return submitLead(cfg.endpoint, payload, extras); })
        .then(function (resp) {
          renderSuccess(resp, ebookOptIn);
          dispatchDelivered(host, cfg, submissionId);
        })
        .catch(function () {
          submitting = false;
          container.innerHTML = errorPanelHtml(cfg);
          var retry = shadow.getElementById('wgc-retry');
          if (retry) retry.addEventListener('click', function () { submitting = false; renderForm(); });
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
