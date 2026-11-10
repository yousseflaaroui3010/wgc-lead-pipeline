// Network layer (form v2, 2026-07-16): render-token fetch (ADR-2), payload
// assembly, and submission with timeout gates so a slow middleware can never
// hang the host page.

// Consent is now EXPLICIT: the visitor must tick the ebook box, whose label
// (STRINGS.ebookLabel in success.js) is the consent wording. Any change to
// that label MUST bump this version string. (Was implied-by-submitting in v2.)
export const CONSENT_TEXT_VERSION = 'v3-explicit-2026-07-22';

// #13 API_BASE: the wgcassetguide.com lead gateway (2026-11-10). It proxies
// /token and /lead to the n8n webhooks after per-visitor rate limits, token
// reuse caps, guide-email caps and (optionally) Turnstile. Calling n8n
// directly is refused once WGC_GATEWAY_SECRET is set there. Dev pages
// override via the data-endpoint attribute.
export const DEFAULT_API_BASE = 'https://wgcassetguide.com/api/leads';

const FETCH_TIMEOUT_MS = 10000;
// Server enforces a 2s–2h token age window; refresh client-side well before
// the ceiling so a visitor who left the tab open is not silently rejected.
const TOKEN_REFRESH_AGE_MS = 60 * 60 * 1000;

function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(function () { controller.abort(); }, FETCH_TIMEOUT_MS);
  const opts = Object.assign({}, options, { signal: controller.signal });
  return fetch(url, opts).finally(function () { clearTimeout(timer); });
}

export function createTokenStore(endpoint) {
  let token = null;
  let issuedAt = 0;

  function refresh() {
    return fetchWithTimeout(endpoint + '/token', { method: 'GET' })
      .then(function (res) {
        if (!res.ok) throw new Error('token fetch failed: ' + res.status);
        return res.text();
      })
      .then(function (text) {
        token = text.trim();
        issuedAt = Date.now();
        return token;
      });
  }

  // Called on user interaction: re-fetch only when the token nears the
  // server's age ceiling. Errors are swallowed here (the render-time token
  // may still be valid); submit() surfaces real failures.
  function ensureFresh() {
    if (token && Date.now() - issuedAt < TOKEN_REFRESH_AGE_MS) return Promise.resolve(token);
    return refresh().catch(function () { return token; });
  }

  return { refresh: refresh, ensureFresh: ensureFresh, get: function () { return token; } };
}

// crypto.randomUUID needs Safari 15.4+; the floor is iOS Safari 15.0, so
// fall back to a getRandomValues-based UUID v4 on older builds. Kept for the
// server-side dedupe key (double-submit guard).
export function newSubmissionId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.prototype.map
    .call(bytes, function (b) { return (b + 0x100).toString(16).slice(1); })
    .join('');
  return (
    hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) +
    '-' + hex.slice(16, 20) + '-' + hex.slice(20)
  );
}

// Canonical payload (estimate-first, 2026-07-22). ip and user_agent are
// appended server-side by WF-1; the client never self-reports either.
// submission_id is transit plumbing for the dedupe guard, not a business
// field. name and phone are no longer collected (kept as empty strings for
// downstream string-safety). email + consent are present ONLY when the
// visitor opted in via the ebook checkbox; an estimate-only submission
// carries no contact info and never dispatches the delivery workflow.
export function buildPayload(data, ctx) {
  var optedIn = data.ebook_opt_in === true && !!data.email;
  return {
    submission_id: ctx.submissionId,
    name: '',
    email: optedIn ? data.email : '',
    phone: '',
    zip: data.zip,
    sqft: data.sqft,
    bedrooms: data.bedrooms == null ? null : data.bedrooms,
    ebook_opt_in: optedIn,
    consent: optedIn
      ? { explicit: true, text_version: CONSENT_TEXT_VERSION, ts: new Date().toISOString() }
      : null,
  };
}

// Posts the lead and returns the parsed JSON response so the caller can
// branch on its shape (#11: {status:"received"} vs {estimate:{...}}).
// Anti-abuse plumbing (token, honeypot as `company`, fill_ms) rides along
// unchanged in mechanism.
export function submitLead(endpoint, payload, extras) {
  const body = Object.assign({}, payload, {
    token: extras.token || '',
    fax: extras.honeypot || '', // honeypot; renamed from "company" (autofill false-positive)
    fill_ms: extras.fillMs,
  });
  if (extras.turnstile) body.turnstile = extras.turnstile;
  return fetchWithTimeout(endpoint + '/lead', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(function (res) {
    if (!res.ok) throw new Error('submit failed: ' + res.status);
    return res.json().catch(function () { return {}; });
  });
}

// Optional Cloudflare Turnstile (data-turnstile-sitekey). Turnstile cannot
// render inside a shadow root, so it gets a light-DOM slot right after the
// mount element. "interaction-only": invisible unless Cloudflare wants a
// click. Rejects on failure so the visitor sees the retry panel instead of a
// silent server-side drop.
var turnstileLoad = null;
export function getTurnstileToken(sitekey, anchor) {
  if (!turnstileLoad) {
    turnstileLoad = new Promise(function (resolve, reject) {
      if (window.turnstile) return resolve(window.turnstile);
      var s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true;
      s.onload = function () { window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile')); };
      s.onerror = function () { turnstileLoad = null; reject(new Error('turnstile')); };
      document.head.appendChild(s);
    });
  }
  return turnstileLoad.then(function (ts) {
    return new Promise(function (resolve, reject) {
      var slot = document.createElement('div');
      anchor.insertAdjacentElement('afterend', slot);
      var id;
      var timer = setTimeout(function () { done(reject, new Error('turnstile timeout')); }, 30000);
      function done(fn, v) {
        clearTimeout(timer);
        try { ts.remove(id); } catch (e) { /* already removed */ }
        slot.remove();
        fn(v);
      }
      id = ts.render(slot, {
        sitekey: sitekey,
        action: 'lead',
        appearance: 'interaction-only',
        callback: function (t) { done(resolve, t); },
        'error-callback': function () { done(reject, new Error('turnstile')); },
      });
    });
  });
}
