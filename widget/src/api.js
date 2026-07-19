// Network layer (form v2, 2026-07-16): render-token fetch (ADR-2), payload
// assembly, and submission with timeout gates so a slow middleware can never
// hang the host page.

// Implied-consent wording is fixed under the submit button (see form.js
// FINE_PRINT). Any change to that copy MUST bump this version string.
export const CONSENT_TEXT_VERSION = 'v2-2026-07-16';

// #13 API_BASE: Railway production webhook base incl. the hook segment
// (public by design once the form ships; bot defense is the HMAC token, not
// path secrecy). Dev pages override via the data-endpoint attribute.
export const DEFAULT_API_BASE = 'https://main-production-bf72.up.railway.app/webhook/d043c102d78e';

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

// Canonical payload (form v2). ip and user_agent are appended server-side by
// WF-1; the client never self-reports either. submission_id is transit
// plumbing for the dedupe guard, not a business field.
export function buildPayload(data, ctx) {
  return {
    submission_id: ctx.submissionId,
    name: data.name,
    email: data.email,
    phone: data.phone,
    zip: data.zip,
    sqft: data.sqft,
    bedrooms: data.bedrooms == null ? null : data.bedrooms,
    ebook_opt_in: data.ebook_opt_in === true,
    consent: {
      implied: true,
      text_version: CONSENT_TEXT_VERSION,
      ts: new Date().toISOString(),
    },
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
  return fetchWithTimeout(endpoint + '/lead', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(function (res) {
    if (!res.ok) throw new Error('submit failed: ' + res.status);
    return res.json().catch(function () { return {}; });
  });
}
