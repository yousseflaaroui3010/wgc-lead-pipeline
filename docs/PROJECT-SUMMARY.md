# Project Summary — Free Rental Analysis Form & Lead Pipeline
**Client:** Westrom Group (Jon Westrom) · **Builder:** Youssef · **Feature 1 of 5**
**Status as of 2026-07-15:** built and verified locally; deploying to a real server next.

---

## What we built (in plain words)

A **"Free Rental Analysis" request form** for property owners, plus the
automatic machinery behind it that turns each submission into a lead the
Westrom team can act on.

A property owner lands on the form, types their name, phone, email, and
property address (under a minute, mostly on a phone), and submits. Behind
the scenes:

- The lead is checked, cleaned, and delivered into Westrom's customer
  system (LeadSimple) — or, until the API key arrives, straight to their
  inbox as a fallback.
- Jon and Ashley get an email alert within a minute of every submission.
- Spam robots are silently blocked (they can't tell they were rejected).
- **No lead can ever be lost** — if one delivery path fails, it
  automatically tries the next, and alerts if all fail.

It ships as a small embeddable widget (drops onto any page with one line
of code) and as its own standalone page.

---

## Why it was built (the reasoning)

- **It's the funnel neck.** Every other planned asset — the cost
  calculator, the guarantees page, the cost-guide PDF, the video hub —
  ends its "call to action" at THIS form. Build the neck first, and
  everything downstream has somewhere to point (decision DEC-01).
- **Research said tooling, not content, is the gap.** Westrom already
  ranks on Google for Fort Worth property-management-cost searches (a blog
  cluster from early 2026). What they lacked was a way to *convert* those
  readers into leads. This form is that missing conversion tool.
- **It's judged on outcomes.** The engagement is a 30-day trial measured
  by "tools shipped + leads captured," not by rankings. A working
  lead-capture form is the most direct proof of value.

---

## Who it's for

- **Prospect (DFW property owner):** the person filling the form —
  mobile-first, wants a fast, trustworthy way to ask "what could my
  property rent for and what would management cost?"
- **Jon & Ashley (Westrom):** receive and work the leads. Jon owns
  scope/approvals; Ashley works leads in the CRM.
- **Goodjuju (Westrom's marketing vendor):** later embeds the widget on
  the main WordPress site (westromgroup.com) without touching our
  internals — we hand them a one-line snippet.

---

## What the competitors are doing

From the verified competitor audit (20 Texas property-management companies,
link-checked during discovery):

- **A free rental-analysis capture form is the primary owner call-to-action
  across effectively all 20 audited competitors.** It is table stakes in
  this market — not having one is the gap; having a fast, clean one is the
  edge.
- Management fees in the DFW market run **8–12% of monthly rent**; median
  Fort Worth rent is ~$2,100. Westrom's own published placement fee is
  75%/65% of one month's rent. (These verified numbers feed the *next*
  feature, the cost calculator — no unverified figures go on public pages.)
- No competitor offers a reusable, brandable calculator wired to a CRM —
  confirming our custom build is worth doing.

---

## How it was built (context & key decisions)

- **Discovery → PRD → architecture chain.** A signed discovery packet
  (PRD-02 v1.1) plus a 4-stage technical chain (architect → tech lead →
  DevOps → QA) locked the requirements and design before any code.
- **The tech, deliberately lightweight:**
  - **Widget:** vanilla JavaScript, zero frameworks, mounted in an *open*
    Shadow DOM so a host site's CSS can never break it and vice versa.
    Hard size budget of **15 KB gzipped** — a build fails if exceeded
    (current build is ~4.8 KB).
  - **Middleware:** self-hosted **n8n** (an automation tool) runs four
    small workflows — issue a security token, validate & de-spam the
    lead, deliver it with retries and fallback, and monitor for silent
    failures. No custom backend server to maintain.
  - **Delivery guarantee:** CRM API first → email-parse fallback →
    notification email, with retries and alerting. "Delivered" = any path
    landed.
- **Bot defense without annoying humans:** a server-issued token that
  direct-posting bots can't fake, a hidden honeypot field, a minimum
  fill-time, server-side validation, and (in production) per-IP rate
  limiting — all rejections return a fake "success" so attackers learn
  nothing.
- **Privacy built in:** consent (TCPA) evidence captured with every lead;
  no lead database of our own; execution logs auto-delete personal data
  after 7 days.
- **Verified locally (2026-07-13):** happy path, consent-unchecked lead,
  bot rejection, double-click de-duplication, and CSS isolation all
  passed on a local Docker stack with a fake mailbox. Three real n8n-2.x
  setup traps were found and documented along the way.

---

## Where things stand & what's next

**Done:**
- Form widget + build pipeline + automated tests (all green).
- Four n8n workflows + the CRM mapping adapter (ships disabled until the
  key arrives; email fallback covers launch).
- Full local end-to-end verification.
- Infrastructure files, backup scripts, and beginner-level deploy runbooks.
- Code merged to the `main` branch.

**Next (in order):**
1. **Deploy to the real server** — a SolusVM VPS ($24.95/year) was
   purchased 2026-07-13; awaiting the provider's welcome email. Full
   click-by-click guide is in `infra/runbooks/deploy.md`.
   (A free-tier demo path also exists in `deploy-free-demo.md` as a
   fallback.)
2. **Wire n8n on the server** (same steps already rehearsed locally).
3. **Run the final on-server tests**, then hand Goodjuju the embed snippet.
4. **Build Feature 2 — the Cost of Management Calculator** (the next
   sibling PRD): shows owners what self-managing costs them using the
   verified DFW numbers, and drops them into THIS same pipeline. Chosen
   as next because it needs zero client decisions and reuses everything
   already built.

**What's left / blocked (not code — waiting on the client):**
See the open decisions below. None block deployment; two (OD-6, OD-7)
block only the final wording, not the working product.

---

## Open decisions still to be confirmed (by Jon / client)

| ID | What's needed | Who | Impact if unanswered |
|----|---------------|-----|----------------------|
| **OD-6** | Lawyer-approved wording for the TCPA consent checkbox (Texas telemarketing rules). We ship a placeholder version tagged "pending counsel." | Jon's counsel | Blocks final copy only, not the working form. |
| **OD-7** | The "expect your analysis within **X** business days" promise in the success message. | Jon | Success message currently says "shortly" until a number is set. |
| **Privacy URL** | Which page the form's Privacy Policy link should point to. | Jon | Defaults to a placeholder page until designated. |
| **LeadSimple API key** | A master-admin in LeadSimple must create the REST API key so leads flow straight into the CRM. | Jon's admin → Youssef | Leads arrive by email fallback until then; no launch blocker. |
| **LeadSimple parse address** | The per-Source email-parse address that turns emails into CRM leads automatically. | Ashley → Youssef | Needed to wire the fallback delivery cleanly. |

**Also on the client's plate (from discovery, not this feature):**
- Consent wording is genuinely a legal question — routed to counsel, not
  guessed.
- The blog-cluster ownership question (who writes the westromgroup.com
  posts, and may we coordinate embeds there) is still open — it affects
  the *end-state* embedding, not this build.

---

## One correction worth remembering
The widgets use **open** Shadow DOM (not closed) — a locked technical
decision (TD-1): closed mode was rejected because it breaks testing and
adds no real security. And the form must **never** show an instant rent
estimate (decision LD-6) — it promises a *human-prepared* analysis only.
