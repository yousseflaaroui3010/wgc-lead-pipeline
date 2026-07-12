# Embed handoff — Free Rental Analysis widget
**For:** Goodjuju Marketing (westromgroup.com, WordPress/Elementor)
**From:** Youssef (builder, wgcassetguide.com) · v1.0 · 2026-07-12

You don't need access to our internals. Two integration options — Option A
is preferred; Option B is the fallback if the theme or a plugin fights the
script.

## Option A — script embed (preferred)

Paste this where the form should appear (Elementor: an HTML widget):

```html
<div id="wgc-analysis">
  <!-- shown only if the script is blocked -->
  <a href="https://wgcassetguide.com/analysis">Request your free rental analysis</a>
</div>
<script src="https://wgcassetguide.com/embed.js" async
  data-widget="rental-analysis"
  data-endpoint="https://wgcassetguide.com/hook"
  data-source="Website - westromgroup"></script>
```

- **One embed per page** (the widget mounts on the `wgc-analysis` id).
- It renders in a Shadow DOM: your theme's CSS cannot break it and its CSS
  cannot touch your page. No stylesheet work needed.
- ~5 KB gzipped, loads `async`, reserves its own height — no layout shift,
  no effect on your page speed scores.
- `data-source` tags where the lead came from; keep the value above for
  westromgroup.com pages so reporting stays clean.
- Optional attributes: `data-sla-days="3"` (success-message promise —
  Jon will confirm the number), `data-privacy-url="…"` (privacy policy link
  target).

## Option B — iframe fallback

```html
<iframe src="https://wgcassetguide.com/analysis"
  title="Free Rental Analysis form"
  style="width:100%;max-width:520px;height:640px;border:0;"
  loading="lazy"></iframe>
```

Our server allows framing from westromgroup.com only (frame-ancestors), so
this works on your pages and nowhere else.

## Conversion tracking (no PII, GTM-ready)

On every successful submission the widget:

1. dispatches a DOM event `wgc-lead-submitted` on `window`
   (`event.detail = { source, submission_id }`), and
2. pushes `{ event: 'wgc_lead_submitted', source, submission_id }` to
   `window.dataLayer` if it exists.

In GTM: a Custom Event trigger on `wgc_lead_submitted` fires your conversion
tag. The payload never contains names, emails, or phone numbers.

## Notes

- No-JS visitors see the plain link inside the div (Option A snippet) — leave
  it in place.
- We can hotfix the widget on our side; your embed code never changes.
  Changes propagate within 5 minutes (cache window).
- Questions / something looks off: contact Youssef.
