# Feature 2 Strategy Brief — Rent Estimate Tool (Northpoint-style)
**Date:** 2026-07-15 · **Author:** Youssef (builder) · **Status:** draft for PM/client sign-off
**Supersedes:** the Cost of Management Calculator (killed by Jon — see below)

> Read this before emailing Jon/Tina. It answers the "dig everywhere"
> questions, sets the data strategy, and lists exactly what to request so
> the email is complete in one shot.

---

## 0. The headline (the thing that changes everything)

**Northpoint is not paying for an expensive rent-estimate API.** Their tool
page states, in their own words, that it is *"powered by Northpoint Market
Intelligence & Parcl,"* built on **their own closed-lease outcomes** (90–180
days of real leasing data, weighted over asking rents) plus **Parcl's**
supply/demand signals. It asks only ZIP, property type, beds, baths, and
(optional) square footage — **no address lookup, no third-party AVM bill.**
([Northpoint rent-estimate page](https://northpointam.com/rent-estimate))

That is the model to copy, and it's *cheaper and more defensible* than any
paid API:

- **Primary data layer = Westrom's own lease history.** They manage ~500
  doors in exactly the DFW submarkets they're estimating. Real closed
  leases in 76052 beat any national AVM's guess for 76052. Cost: **$0**.
  This is why the **Lease History Export is the single most important input
  to this whole feature** (details in §6).
- **Market-signal layer = Parcl Labs API.** Same provider Northpoint uses.
  **1,000 free credits/month**, Pro is $99/mo if we ever outgrow free.
  Gives a daily rent-per-square-foot feed + supply/demand per market —
  the "market signals" Northpoint shows.
  ([Parcl pricing](https://docs.parcllabs.com/docs/usage-limitations))
- **Thin fallback layer (optional) = a cheap AVM** only for addresses where
  Westrom has no comparable lease of their own (see §2 for the cheapest).

So the strategic answer to "how does Northpoint do it without losing money"
is: **they use data they already own.** So can Westrom.

---

## 1. Can we get around "Tina must email RentEngine to confirm the API exposes comps"?

**Short answer: yes, three ways — and none of them should block the build.**

**What's confirmed (medium confidence, public):** RentEngine's Market Tool
2.0 announcement lists *"Full U.S. rental data, owner reports, API and a
lead widget."* So an API exists and rental data is part of the product.
([RentEngine blog](https://www.rentengine.io/blog))

**What is NOT publicly documented (and genuinely can't be confirmed without
them):** whether the API returns *active rental comps* (individual live
listings) versus only aggregated market numbers, and the per-call fee.
There is no public developer-docs portal I can find. So the underlying
question is real — but *how* we answer it can change:

1. **Make it an onboarding ask, not a support ticket.** Westrom is
   migrating onto RentEngine in September. API access to the Market Tool is
   a normal part of that onboarding, and it's a *technical* request that's
   naturally **yours (Youssef), not Tina's**: "As part of our September
   migration we want to use the Market Tool API on our website — please
   send developer docs, endpoint list, and per-call pricing." That's a
   stronger, more legitimate channel than a one-off "does it do X" email,
   and it puts you (not Tina) in the data conversation.
2. **Don't let it gate the code.** Build the estimator against a
   **provider-agnostic data adapter** — the exact same pattern as the
   LeadSimple mapping adapter we already shipped. The estimator asks a
   generic "get comps for this segment" interface; RentEngine / Parcl /
   own-lease-history / a fallback AVM all sit behind it. When the RentEngine
   answer arrives, we flip one config object — zero rework. This is what
   turns the unknown from a blocker into a footnote.
3. **You may not even need their comps.** If the own-lease-history layer
   (§6) plus Parcl covers the estimate, RentEngine's comps become a
   nice-to-have, not a dependency. The migration still gives us the lead
   routing we want regardless.

**Recommendation:** proceed with the adapter design; send the RentEngine
onboarding/API request in parallel; treat their comps as an optional
enrichment, not the foundation.

---

## 2. Cheaper / free alternatives to RentCast ($74/mo — Jon said no)

Ranked by strategic fit, cheapest-and-best first:

| Option | Cost | What it gives | Verdict |
|---|---|---|---|
| **Westrom's own lease history** | **$0** | Real closed rents in Westrom's exact submarkets | **Primary layer.** Most accurate for their market, no ToS risk, no vendor. |
| **Parcl Labs API** | **1,000 credits/mo free**, Pro $99 | Daily rent $/sqft + supply/demand signals per market | **Signal layer.** Same source Northpoint uses. Free tier likely enough with caching. |
| **RentCast free tier** | **50 calls/mo free** ($74 only if we exceed) | True address-level rent AVM + comps, 140M properties | **Cache-primed fallback.** See the caching trick below — 50 fresh calls can serve hundreds of visitors. |
| TheDataClouds "Rent Estimate API" | free trial, then $50/mo | Monthly rent estimate + min/max range | Backup AVM if RentCast free proves too tight. |
| Rentometer API | credit-based | Rent comps + reports | Backup; per-report pricing. |
| RentEngine Market Tool API | unknown fee (see §1) | Their cleaned rental data | Enrichment once onboarded. |

Sources: [RentCast API pricing](https://www.rentcast.io/api),
[api.market real-estate API roundup](https://api.market/blog/magicapi/real-estate/best-real-estate-api),
[Parcl usage limits](https://docs.parcllabs.com/docs/usage-limitations).

**The caching trick that makes "free" actually work:** a rent estimate for
a *segment* — (ZIP + property type + beds + baths + sqft-band) — does not
change hour to hour. Northpoint themselves estimate by *segment*, not by
exact address. If we cache results by segment for ~30 days, then RentCast's
50 free monthly calls (or Parcl's 1,000 credits) refresh a large library of
segments that serve **hundreds** of visitors. The visitor still gets an
instant on-screen number; we just don't pay per visitor. This is the single
biggest cost lever and it's ours to pull for free.

**Bottom line for Jon:** we can ship a real instant estimator for **$0/month
in data cost** (own lease history + Parcl free + cached RentCast free),
scaling to a $99 Parcl tier only if volume ever demands it. No $74 RentCast
subscription needed.

---

## 3. The RentEngine free widget overlaps ~90% with what we already built

The Market Tool 2.0 post also ships a **free "get my free rental analysis"
website widget** for RentEngine customers: capture form → background report
→ your team reviews and sends → routes leads into LeadSimple/any CRM by
email. ([RentEngine blog](https://www.rentengine.io/blog))

**That is almost exactly PRD-02 — the pipeline we already built and
verified.** The honest read:

- **What theirs does that ours does:** capture, consent, route to LeadSimple.
- **What theirs does NOT do:** show the visitor an *instant on-screen
  estimate.* It's still "wait for a human to send it." Jon's Northpoint
  "wow" was the 2-second number — theirs doesn't deliver that.
- **What it means for us:**
  - Our **instant estimator is the genuine net-new value** — that's where
    the build effort goes.
  - Our **existing capture pipeline is the bird in hand**: it works today,
    before the September migration, with no vendor lock, and we control it
    fully. Keep it as the lead spine; the estimator feeds into it.
  - **You must be the one to surface the RentEngine widget to Jon.** Tina
    already found the Market Tool API on her own once. If she surfaces the
    free widget before you do, it looks like you missed a free tool that
    overlaps your build. Get ahead of it: "RentEngine ships a free capture
    widget post-migration; we've already built an equivalent we control,
    and our differentiator is the instant estimate theirs lacks."

---

## 4. Scope + compliance flags (must be recorded, not assumed)

1. **This reverses a locked decision.** PRD-02's **LD-6** explicitly banned
   any instant rent estimate ("human-prepared analysis only"). Jon is now
   asking for the opposite. That's his call as client — but it must be
   logged as a **scope change opening a new PRD-03**, not a quiet edit.
   PRD-02's form (what we built) stays valid; the estimator is a sibling.
2. **The legal check doesn't die, it moves.** Showing rent numbers publicly
   raises a display-rights question. The good news: if the number is
   derived from **Westrom's own lease data + Parcl**, there's no MLS/NTREIS
   republishing problem — it's their data. If we ever surface RentEngine or
   RentCast *comps* on screen, the governing rules become **that provider's
   Terms of Service on republishing**, not NTREIS. Cheaper problem, but
   still a real one — read the ToS of whatever provider's data we *display*
   (vs. merely use to compute a single number).
3. **Never integrate against Propertyware.** Migration to RentEngine is
   ~September 2026; Propertyware is being retired. Any lease-history export
   we design must be portable (a CSV/columns spec), not a Propertyware API
   binding, so it survives the switch.
4. **Keep the promise honest.** The widget we already deployed does *no*
   valuation — it's a secure intake pipeline (bouncer + mail carrier). The
   estimator is the first thing that computes a number; label internal work
   accordingly so nobody claims automated analysis before it exists.

---

## 5. Recommended architecture (one page)

```
Visitor types: ZIP, property type, beds, baths, (optional) sqft
        │
        ▼
  Estimator widget  (vanilla JS, open Shadow DOM, <15 KB — same rules as Feature 1)
        │  GET /estimate?segment=...
        ▼
  n8n "WF-Estimate" workflow  ──► DATA ADAPTER (provider-agnostic)
        │                              ├─ Layer 1: Westrom lease-history table (own data)  ← primary
        │                              ├─ Layer 2: Parcl market signal (free tier, cached)
        │                              └─ Layer 3: RentCast/RentEngine AVM (fallback, cached 30d)
        ▼
  Returns a RANGE (list price / floor) + est. days-on-market + market signal
        │
        ▼
  "Want the full human-prepared analysis? " → drops into the Feature-1 capture pipeline
```

- **Segment-based, not address-based** (mirrors Northpoint; sidesteps
  address-level licensing and makes caching trivial).
- **Show a range, not a false-precision single number** (defensible, honest,
  and matches how Northpoint presents it).
- **The estimator is a lead magnet that terminates in the pipeline we
  already built** — so Feature 1 is not wasted; it's the destination.

---

## 6. What I need FROM Tina/Jon (draft this into the email)

**From Tina (data — the critical path):**
1. **Lease History Export** — the heart of the whole feature. Request a
   one-time export **plus** an agreed monthly refresh, as CSV, with these
   columns per closed lease (last 24 months if available):
   - property ZIP (and city)
   - property type (SFH / townhome / condo / duplex…)
   - bedrooms, bathrooms
   - square footage
   - **final signed monthly rent** (not asking rent)
   - lease start date (or signed date)
   - days on market before lease (if the system has it)
   - *No tenant names or PII — property + terms only.*
   This is exportable from Propertyware today and from RentEngine after
   September; the column list above is what makes it portable across both.
2. **The "24 actives in 76052" Market Tool screen** — confirm it's the
   RentEngine Market Tool, and whether she can export or screenshot a few so
   we can validate our estimator's ranges against it during QA.
3. **Blind validation (later):** once the tool produces numbers, Tina
   spot-checks our output against real MLS/known deals before Jon sees it.

**From Jon (decisions — mostly confirmations now, see §7):**
- Confirm reusing the **existing published consent wording** (OD-6).
- Confirm the estimator's **home** = homepage "is your rental price
  competitive?" section + an Owners-menu item (OD-11).
- Approve the **scope change** (estimator replaces the calculator; opens
  PRD-03) and the **show-a-range, own-data** approach.

**From the RentEngine relationship (Youssef sends, per §1):**
- Developer docs + endpoint list + per-call pricing for the Market Tool API,
  framed as September-migration onboarding.

---

## 7. Updated open decisions

| ID | Status now | Note |
|----|-----------|------|
| **OD-6** (consent wording) | **Near-closed** | Westrom already publishes vetted SMS-consent language on westromgroup.com. Ask Jon to *confirm reuse*, not approve new text. ([homepage](https://westromgroup.com)) |
| **OD-11** (where the tool lives) | **Proposed** | Homepage "is your rental price competitive?" section + Owners menu. Jon says yes or moves it. |
| **OD-13** (does comps data have an API) | **Mostly answered** | Yes — Market Tool 2.0 ships an API. Open sub-question: exact fee + whether *active comps* are exposed vs app-only (§1). Reframed as onboarding ask. |
| **OD-14 (new)** (LD-6 reversal) | **Open — needs Jon** | Instant estimate reverses a locked decision; must be approved as scope change → PRD-03. |
| **OD-15 (new)** (display rights) | **Open** | If we display provider comps, read that provider's ToS; if we display only own-data-derived ranges, no third-party issue. |
| **OD-7** (X business days) | Unchanged | Still Jon; affects Feature-1 success copy only. |
| LeadSimple key / parse address | Unchanged | Feature-1 items; fallback covers launch. |

---

## 8. Server (unblock the deploy)

The SolusVM "2 GB KVM" from vpshostingservice.co was a dead end — support
said the KVM plan is obsolete/out of stock two days after purchase. **Action:
request a refund/chargeback on the $24.95** (services not delivered as sold).

**Use a mainstream, in-stock provider instead** (reputation matters more
than saving $1/mo on a reseller):
- **Hetzner Cloud** — CPX11, ~€4.5/mo, 2 GB RAM, excellent reputation,
  instant provisioning. Top pick.
- **DigitalOcean** — $6/mo basic droplet, 1 GB (or $12 for 2 GB), rock
  solid, great docs.
- **Vultr** — similar to DO, $5–6/mo.

All three are hourly-billable (kill it anytime), never "out of stock," and
`infra/runbooks/deploy.md` works on any of them unchanged (they all give
Ubuntu 24.04 + an IP + SSH). Pick Hetzner or DigitalOcean and we deploy the
same day.

---

## TL;DR
Copy Northpoint's real playbook: **estimate from Westrom's own lease history
+ Parcl's free tier**, show a *range* by *segment*, cache aggressively, and
keep a cheap AVM only as fallback — **$0/mo data cost to start.** Build it
behind a provider-agnostic adapter so the unresolved RentEngine-comps
question never blocks code. The instant estimate is the net-new value; the
capture pipeline we already built is its destination. Get the **Lease
History Export** from Tina — it's the whole ballgame. Log the LD-6 reversal
as PRD-03. Refund the bad VPS; redeploy on Hetzner/DigitalOcean.
