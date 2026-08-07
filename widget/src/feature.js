// Feature-layout chrome (T-brand-restyle-estimator): the section heading and
// the black guarantee-recap column that sit around the form on the Westrom
// pricing page. Same relationship to form.js as modal.js has -- it owns only
// chrome, never the form markup, validation or payload.
//
// Why the chrome is built OUTSIDE the state container: form.js swaps
// container.innerHTML wholesale between form / loading / error / success. Page
// furniture must survive those swaps, so `container` is appended INTO this
// chrome rather than the chrome being rendered as part of it.
//
// The handoff also specifies a black "We protect your investment" transition
// strip above the heading. It is deliberately NOT built here: the Guarantees
// graphic directly above this section on /pricing/ already ends with that exact
// bar, so rendering a second one reads as a stutter. See DECISIONS 2026-08-07.
//
// i18n note: same convention as success.js / modal.js -- no runtime i18n under
// the 15 KB gzip budget (TD-4), so user copy is centralized as named constants.

import { escapeHtml } from './success.js';

export var FEATURE_STRINGS = {
  eyebrow: 'Now the numbers',
  // Hard break after "your" on desktop; the CSS lets it wrap freely below.
  title: 'Start with what your property is worth',
  recapTitle: 'Backed by six guarantees',
  // Numerals match the 01-06 numbering on the live Guarantees graphic.
  // PARKED: the graphic says eviction protection is capped at $1,000 while the
  // pricing table on the same page says $750. Naming no figure is the only
  // honest option until Jon resolves it; do not guess a number here.
  recap: [
    { n: '01', t: '12-month tenant placement guarantee' },
    { n: '02', t: 'Eviction protection guarantee' },
    { n: '05', t: '90-day money back guarantee' },
  ],
  recapFoot: 'The estimate is free and instant. What you do with it is up to you.',
};

function recapItemsHtml() {
  return FEATURE_STRINGS.recap.map(function (r) {
    return (
      '<li class="wgc-recap-item">' +
      // aria-hidden: the numeral is a visual index into the graphic above, not
      // information -- read aloud it would prefix every line with "zero one".
      '<span class="wgc-recap-num" aria-hidden="true">' + escapeHtml(r.n) + '</span>' +
      '<span class="wgc-recap-text">' + escapeHtml(r.t) + '</span>' +
      '</li>'
    );
  }).join('');
}

// Builds the section chrome and puts `container` inside the panel grid.
// Returns the root element for the caller to append to the shadow root.
export function createFeatureLayout(doc, container) {
  var root = doc.createElement('div');
  root.className = 'wgc-feature';

  var head = doc.createElement('div');
  head.className = 'wgc-sechead';
  head.innerHTML =
    '<span class="wgc-eyebrow">' + escapeHtml(FEATURE_STRINGS.eyebrow) + '</span>' +
    // h2 here, h3 for the form title inside it: the section owns the heading
    // level so the page outline stays correct when this is embedded.
    '<h2 class="wgc-sectitle">' + escapeHtml(FEATURE_STRINGS.title) + '</h2>';

  var grid = doc.createElement('div');
  grid.className = 'wgc-panel-grid';

  var recap = doc.createElement('aside');
  recap.className = 'wgc-recap';
  recap.innerHTML =
    '<h3 class="wgc-recap-title">' + escapeHtml(FEATURE_STRINGS.recapTitle) + '</h3>' +
    '<div class="wgc-recap-rule"></div>' +
    '<ul class="wgc-recap-list">' + recapItemsHtml() + '</ul>' +
    '<p class="wgc-recap-foot">' + escapeHtml(FEATURE_STRINGS.recapFoot) + '</p>';

  grid.appendChild(recap);
  grid.appendChild(container);
  root.appendChild(head);
  root.appendChild(grid);
  return root;
}
