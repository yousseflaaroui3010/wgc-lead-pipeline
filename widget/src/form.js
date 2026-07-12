// Entry point. Mounts the rental-analysis form into an open Shadow DOM
// (TD-1) on #wgc-analysis, configured entirely via data- attributes on the
// script tag (TD-2). No secrets, no PII persistence, zero runtime deps (TD-4).

import cssText from './styles.css';
import { validateAll } from './validate.js';
import {
  createTokenStore,
  newSubmissionId,
  readUtm,
  buildPayload,
  submitLead,
} from './api.js';

var MOUNT_ID = 'wgc-analysis';
// FR-2 display text, version WGC-TCPA-2026-07-v1. Pending counsel (OD-6):
// any wording change must also bump CONSENT_TEXT_VERSION in api.js.
var CONSENT_TEXT =
  'By clicking submit, I agree to receive calls and text messages from ' +
  'Westrom Group at the number provided. Consent is not a condition of any ' +
  'purchase or service. Message and data rates may apply.';

var FIELDS = [
  { name: 'first_name', label: 'First name', type: 'text', required: true, autocomplete: 'given-name', maxlength: 60 },
  { name: 'last_name', label: 'Last name', type: 'text', required: true, autocomplete: 'family-name', maxlength: 60 },
  { name: 'email', label: 'Email', type: 'email', required: true, autocomplete: 'email', maxlength: 254 },
  { name: 'phone', label: 'Phone', type: 'tel', required: true, autocomplete: 'tel', maxlength: 20 },
  { name: 'property_address', label: 'Property address', type: 'text', required: true, autocomplete: 'street-address', maxlength: 120 },
  { name: 'beds', label: 'Beds (optional)', type: 'number', required: false, maxlength: 2 },
  { name: 'baths', label: 'Baths (optional)', type: 'number', required: false, maxlength: 4 },
];

function fieldHtml(f) {
  var half = f.name === 'beds' || f.name === 'baths';
  return (
    '<div class="wgc-field" data-half="' + half + '">' +
    '<label class="wgc-label" for="wgc-' + f.name + '">' + f.label + '</label>' +
    '<input class="wgc-input" id="wgc-' + f.name + '" name="' + f.name + '"' +
    ' type="' + f.type + '" maxlength="' + f.maxlength + '"' +
    (f.autocomplete ? ' autocomplete="' + f.autocomplete + '"' : '') +
    (f.required ? ' required aria-required="true"' : '') +
    (f.name === 'baths' ? ' step="0.5" min="0" max="20"' : '') +
    (f.name === 'beds' ? ' step="1" min="0" max="20"' : '') +
    ' aria-describedby="wgc-err-' + f.name + '">' +
    '<span class="wgc-err" id="wgc-err-' + f.name + '" aria-live="polite"></span>' +
    '</div>'
  );
}

function formHtml(cfg) {
  var rows =
    '<div class="wgc-row">' + fieldHtml(FIELDS[0]) + fieldHtml(FIELDS[1]) + '</div>' +
    fieldHtml(FIELDS[2]) + fieldHtml(FIELDS[3]) + fieldHtml(FIELDS[4]) +
    '<div class="wgc-row">' + fieldHtml(FIELDS[5]) + fieldHtml(FIELDS[6]) + '</div>';
  return (
    '<div class="wgc-wrap">' +
    '<h2 class="wgc-title">Free Rental Analysis</h2>' +
    '<p class="wgc-sub">Tell us about your property and the Westrom team will prepare your analysis.</p>' +
    '<p class="wgc-status" id="wgc-status" role="status" aria-live="polite"></p>' +
    '<form id="wgc-form" novalidate>' +
    rows +
    '<div class="wgc-field">' +
    '<label class="wgc-label" for="wgc-message">Message (optional)</label>' +
    '<textarea class="wgc-textarea" id="wgc-message" name="message" maxlength="1000"' +
    ' aria-describedby="wgc-err-message"></textarea>' +
    '<span class="wgc-err" id="wgc-err-message" aria-live="polite"></span>' +
    '</div>' +
    // Honeypot (bot defense): real users never see or tab into this.
    '<div class="wgc-hp" aria-hidden="true">' +
    '<label for="wgc-company">Company</label>' +
    '<input id="wgc-company" name="company" type="text" tabindex="-1" autocomplete="off">' +
    '</div>' +
    '<div class="wgc-check">' +
    '<input type="checkbox" id="wgc-tcpa" name="tcpa">' +
    '<label for="wgc-tcpa">' + CONSENT_TEXT + '</label>' +
    '</div>' +
    '<button class="wgc-btn" type="submit" id="wgc-submit">Get My Free Analysis</button>' +
    '<a class="wgc-privacy wgc-link" href="' + cfg.privacyUrl + '" target="_blank" rel="noopener">Privacy Policy</a>' +
    '</form>' +
    '</div>'
  );
}

function panelHtml(title, body, withRetry) {
  return (
    '<div class="wgc-wrap"><div class="wgc-panel" role="status" aria-live="assertive">' +
    '<h2 class="wgc-title">' + title + '</h2>' +
    '<p class="wgc-sub">' + body + '</p>' +
    (withRetry ? '<button class="wgc-btn" id="wgc-retry" type="button">Try again</button>' : '') +
    '</div></div>'
  );
}

function readConfig(script) {
  var endpoint = script.getAttribute('data-endpoint') || 'https://wgcassetguide.com/hook';
  return {
    endpoint: endpoint.replace(/\/+$/, ''),
    source: script.getAttribute('data-source') || 'Website - wgcassetguide',
    // Final privacy page is Jon's call (FR-8); default is the
    // builder-controlled page until designated.
    privacyUrl: script.getAttribute('data-privacy-url') || 'https://wgcassetguide.com/privacy',
    // OD-7: "expect it within X business days". Unset until Jon answers.
    slaDays: script.getAttribute('data-sla-days') || '',
    fallbackUrl: script.getAttribute('data-fallback-url') || 'https://wgcassetguide.com/analysis',
  };
}

function successBody(cfg) {
  var when = cfg.slaDays
    ? 'expect it within ' + cfg.slaDays + ' business days.'
    : 'we will be in touch shortly.'; // placeholder until OD-7 sets X
  return 'Your analysis will be prepared by the Westrom team &mdash; ' + when;
}

function dispatchDelivered(host, cfg, submissionId) {
  // FR-7: no PII in the detail, composed so it crosses the shadow boundary.
  var detail = { source: cfg.source, submission_id: submissionId };
  var evt = new CustomEvent('wgc-lead-submitted', { bubbles: true, composed: true, detail: detail });
  host.dispatchEvent(evt);
  window.dispatchEvent(new CustomEvent('wgc-lead-submitted', { detail: detail }));
  if (Array.isArray(window.dataLayer)) {
    window.dataLayer.push({ event: 'wgc_lead_submitted', source: cfg.source, submission_id: submissionId });
  }
}

function collectFields(form) {
  function val(name) {
    var el = form.querySelector('[name="' + name + '"]');
    return el ? el.value : '';
  }
  return {
    first_name: val('first_name'),
    last_name: val('last_name'),
    email: val('email'),
    phone: val('phone'),
    property_address: val('property_address'),
    beds: val('beds'),
    baths: val('baths'),
    message: val('message'),
  };
}

function showFieldErrors(root, errors) {
  var firstBad = null;
  ['first_name', 'last_name', 'email', 'phone', 'property_address', 'beds', 'baths', 'message'].forEach(function (name) {
    var input = root.querySelector('[name="' + name + '"]');
    var err = root.getElementById('wgc-err-' + name);
    var msg = errors[name] || '';
    if (err) err.textContent = msg;
    if (input) input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    if (msg && !firstBad) firstBad = input;
  });
  if (firstBad) firstBad.focus();
}

function mount(script) {
  if (!script) return;
  var cfg = readConfig(script);
  var host = document.getElementById(MOUNT_ID);
  if (!host || host.shadowRoot) return;

  var shadow = host.attachShadow({ mode: 'open' }); // TD-1: open, testable
  var style = document.createElement('style');
  style.textContent = cssText;

  var container = document.createElement('div');
  shadow.appendChild(style);
  shadow.appendChild(container);

  var tokens = createTokenStore(cfg.endpoint);
  tokens.refresh().catch(function () { /* retried on interaction + submit */ });

  var submissionId = null; // stable across retries so WF-1 dedupe holds
  var submitting = false;

  function renderForm() {
    container.innerHTML = formHtml(cfg);
    var form = shadow.getElementById('wgc-form');
    var btn = shadow.getElementById('wgc-submit');
    var status = shadow.getElementById('wgc-status');

    form.addEventListener('focusin', function () { tokens.ensureFresh(); });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (submitting) return; // double-submit guard (FR-4)

      var checked = validateAll(collectFields(form));
      if (!checked.ok) {
        showFieldErrors(shadow, checked.errors);
        status.textContent = 'Please fix the highlighted fields.';
        status.setAttribute('data-kind', 'error');
        return;
      }
      showFieldErrors(shadow, {});
      checked.data.tcpa = shadow.getElementById('wgc-tcpa').checked;

      if (!submissionId) submissionId = newSubmissionId();
      var payload = buildPayload(checked.data, {
        submissionId: submissionId,
        source: cfg.source,
        pageUrl: window.location.href,
        utm: readUtm(window.location.search),
      });
      var honeypot = shadow.getElementById('wgc-company').value;

      submitting = true;
      btn.disabled = true;
      status.removeAttribute('data-kind');
      status.textContent = 'Sending your request…';

      tokens
        .ensureFresh()
        .then(function (token) { return submitLead(cfg.endpoint, payload, token || '', honeypot); })
        .then(function () {
          container.innerHTML = panelHtml('Request received', successBody(cfg), false);
          dispatchDelivered(host, cfg, submissionId);
        })
        .catch(function () {
          submitting = false;
          container.innerHTML = panelHtml(
            'Something went wrong',
            'Your request was not sent. Please try again, or use our ' +
            '<a class="wgc-link" href="' + cfg.fallbackUrl + '">rental analysis page</a>.',
            true
          );
          var retry = shadow.getElementById('wgc-retry');
          if (retry) retry.addEventListener('click', function () {
            submitting = false;
            renderForm();
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
