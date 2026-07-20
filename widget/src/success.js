// Success-state view builder (form v2), kept DOM-free so both response
// shapes (#11) are unit-testable in Node. form.js injects the returned HTML
// into the shadow root and wires the one CTA listener.
//
// i18n note: the widget is a zero-runtime-dependency embed under a 15 KB
// gzip budget (TD-4), so a full i18n runtime is out of scope. All
// user-facing copy is centralized here (and in form.js FIELDS) as named
// constants — the lightweight, swappable equivalent of message keys.

export const STRINGS = {
  finePrint:
    'By requesting your analysis, you agree Westrom Group may contact you about your property.',
  ebookLabel:
    'Also send me the free guide: How to Hire the Best Property Manager for You',
  ebookSent: 'Your free guide is on its way to your inbox.',
  receivedTitle: 'Request received',
  receivedBody:
    'Your analysis will be prepared by the Westrom team. We will be in touch shortly.',
  estimateTitle: 'Your estimated rent range',
  compsHeading: 'Recent nearby rentals',
  cta: 'Get a free expert review',
  thanksTitle: 'You are all set',
  thanksBody:
    'A Westrom specialist will review your property and follow up with a human-prepared analysis.',
};

export function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// #11 shape detection: presence of `estimate` selects the result card.
export function detectShape(resp) {
  return resp && typeof resp === 'object' && resp.estimate ? 'estimate' : 'received';
}

function money(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return '';
  return '$' + Math.round(num).toLocaleString('en-US');
}

function ebookLine(opts) {
  return opts && opts.ebookOptIn
    ? '<p class="wgc-sub wgc-ebook-note">' + escapeHtml(STRINGS.ebookSent) + '</p>'
    : '';
}

function compRow(c) {
  const parts = [];
  if (c.zip != null && c.zip !== '') parts.push('ZIP ' + escapeHtml(c.zip));
  if (c.beds != null && c.beds !== '') parts.push(escapeHtml(c.beds) + ' bd');
  if (c.sqft != null && c.sqft !== '') parts.push(Number(c.sqft).toLocaleString('en-US') + ' sqft');
  if (c.ago_days != null && c.ago_days !== '') parts.push(escapeHtml(c.ago_days) + ' days ago');
  const rent = money(c.rent);
  return (
    '<li class="wgc-comp">' +
    '<span class="wgc-comp-meta">' + parts.join(' &middot; ') + '</span>' +
    (rent ? '<span class="wgc-comp-rent">' + rent + '/mo</span>' : '') +
    '</li>'
  );
}

export function buildReceivedHtml(opts) {
  return (
    '<div class="wgc-panel" role="status" aria-live="assertive">' +
    '<h2 class="wgc-title" id="wgc-dyn-title">' + escapeHtml(STRINGS.receivedTitle) + '</h2>' +
    '<p class="wgc-sub">' + escapeHtml(STRINGS.receivedBody) + '</p>' +
    ebookLine(opts) +
    '</div>'
  );
}

export function buildEstimateHtml(estimate, opts) {
  const low = money(estimate.low);
  const high = money(estimate.high);
  const range = low && high ? low + ' &ndash; ' + high : (low || high || '');
  const comps = Array.isArray(estimate.comps) ? estimate.comps.slice(0, 3) : [];
  const compsHtml = comps.length
    ? '<p class="wgc-sub wgc-comps-heading">' + escapeHtml(STRINGS.compsHeading) + '</p>' +
      '<ul class="wgc-comps">' + comps.map(compRow).join('') + '</ul>'
    : '';
  return (
    '<div class="wgc-panel wgc-result" role="status" aria-live="assertive">' +
    '<h2 class="wgc-title" id="wgc-dyn-title">' + escapeHtml(STRINGS.estimateTitle) + '</h2>' +
    '<p class="wgc-range">' + range + '<span class="wgc-range-unit">/mo</span></p>' +
    compsHtml +
    ebookLine(opts) +
    '<button class="wgc-btn" type="button" id="wgc-cta">' + escapeHtml(STRINGS.cta) + '</button>' +
    '<div class="wgc-thanks" id="wgc-thanks" hidden>' +
    '<h3 class="wgc-title">' + escapeHtml(STRINGS.thanksTitle) + '</h3>' +
    '<p class="wgc-sub">' + escapeHtml(STRINGS.thanksBody) + '</p>' +
    '</div>' +
    '</div>'
  );
}

// Returns the inner HTML for the success container based on the response
// shape. opts.ebookOptIn appends the guide-on-its-way line (#12).
export function buildSuccessHtml(resp, opts) {
  if (detectShape(resp) === 'estimate') {
    return buildEstimateHtml(resp.estimate || {}, opts);
  }
  return buildReceivedHtml(opts);
}
