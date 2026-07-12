// Network layer: render-token fetch (ADR-2), payload assembly (PRD §E v1.0),
// and submission with timeout gates so a slow middleware can never hang the
// host page (PRD NFR + fail-containment rule).

export const SCHEMA_VERSION = '1.0';
export const CONSENT_TEXT_VERSION = 'WGC-TCPA-2026-07-v1';

const FETCH_TIMEOUT_MS = 10000;
// Server enforces a 2s–2h token age window; refresh client-side well before
// the ceiling so a visitor who left the tab open does not get silently
// bot-rejected on submit.
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

  // Called on user interaction: re-fetch only when the token is nearing the
  // server's age ceiling. Errors are swallowed here (the render-time token
  // may still be valid); submit() surfaces real failures.
  function ensureFresh() {
    if (token && Date.now() - issuedAt < TOKEN_REFRESH_AGE_MS) return Promise.resolve(token);
    return refresh().catch(function () { return token; });
  }

  return { refresh: refresh, ensureFresh: ensureFresh, get: function () { return token; } };
}

// crypto.randomUUID needs Safari 15.4+; the PRD floor is iOS Safari 15.0,
// so fall back to a getRandomValues-based UUID v4 on older builds.
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

export function readUtm(search) {
  const params = new URLSearchParams(search || '');
  return {
    source: params.get('utm_source') || '',
    medium: params.get('utm_medium') || '',
    campaign: params.get('utm_campaign') || '',
  };
}

// Canonical payload v1.0 (PRD §E). Server-side evidence (ip, user_agent) is
// appended by WF-1; the client never self-reports either.
export function buildPayload(data, ctx) {
  return {
    schema_version: SCHEMA_VERSION,
    submission_id: ctx.submissionId,
    first_name: data.first_name,
    last_name: data.last_name,
    email: data.email,
    phone: data.phone,
    property_address: data.property_address,
    beds: data.beds,
    baths: data.baths,
    message: data.message,
    source: ctx.source,
    page_url: ctx.pageUrl,
    utm: ctx.utm,
    consent: {
      tcpa: data.tcpa === true,
      timestamp: new Date().toISOString(),
      text_version: CONSENT_TEXT_VERSION,
    },
  };
}

export function submitLead(endpoint, payload, token, honeypotValue) {
  const body = Object.assign({}, payload, {
    token: token,
    company: honeypotValue || '',
  });
  return fetchWithTimeout(endpoint + '/lead', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(function (res) {
    if (!res.ok) throw new Error('submit failed: ' + res.status);
    return true;
  });
}
