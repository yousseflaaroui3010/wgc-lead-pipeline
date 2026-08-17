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
// Same reasoning now governs the panel COPY itself, see FEATURE_STRINGS below.
//
// i18n note: same convention as success.js / modal.js -- no runtime i18n under
// the 15 KB gzip budget (TD-4), so user copy is centralized as named constants.

import { escapeHtml } from './success.js';

// Copy rewritten 2026-08-17. The panel used to recap three of the six
// guarantees. Ashley and Jon killed that: the Guarantees graphic sits directly
// above this section on /pricing/, so repeating it was both duplication and
// (because of the $750 vs $1,000 conflict on their own page) wrong.
//
// What replaced it, and why this and not credentials: in Buildium's 2026 survey
// of 300 US rental owners, owners leave a manager over poor communication (57%)
// and lack of transparency (34%), and only 23% rate their manager's value as
// excellent. The reader of this page mostly already HAS a manager and is
// unhappy with them. So the panel sells access and plain dealing.
//
// EVERY line below traces to a live public source. Nothing here is inferred:
//   "since 1994"      -> BBB record, business start date 1994-01-01, and
//                        westromgroup.com's own "over 30 years in Fort Worth"
//   "not a franchise" -> westromgroup.com verbatim ("We're not a franchise or
//                        a corporate chain")
//   "Jon Westrom"     -> westromgroup.com, listed as broker/owner
//   "single-family"   -> westromgroup.com ("single-family homes across Fort
//                        Worth and DFW")
//
// DELIBERATELY ABSENT, do not add without a source Jon confirms in writing:
//   review counts  -> their own homepage says "400+" in one place and "320+"
//                     in another, and an aggregator says "432+". Three numbers,
//                     one fact.
//   unit count     -> "515+ units" appears only on lead-gen aggregators that
//                     are paid by the firms they list.
//   TREC #9009188 / NARPM -> self-reported only. HAR blocked (403) and the
//                     NARPM directory returned nothing.
//   BBB anything   -> the BBB profile reads NOT accredited and Not Rated.
// See DECISIONS 2026-08-17 and the research trail in the handover doc.
export var FEATURE_STRINGS = {
  eyebrow: 'Now the numbers',
  // Hard break after "your" on desktop; the CSS lets it wrap freely below.
  title: 'Start with what your property is worth',
  recapTitle: 'Managing Fort Worth rentals since 1994',
  recap: [
    'Family owned. Not a franchise, not a call centre.',
    'Jon Westrom, the broker, is who you actually talk to.',
    'Single-family homes across Fort Worth and DFW.',
  ],
  recapFoot: 'The estimate is free and instant. What you do with it is up to you.',
};

function recapItemsHtml() {
  return FEATURE_STRINGS.recap.map(function (t) {
    return (
      '<li class="wgc-recap-item">' +
      // Decorative dash. It replaced a numbered circle that indexed into the
      // Guarantees graphic; with that content gone the numerals meant nothing.
      '<span class="wgc-recap-mark" aria-hidden="true"></span>' +
      '<span class="wgc-recap-text">' + escapeHtml(t) + '</span>' +
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
