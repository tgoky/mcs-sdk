# The Verdict First

**Don't kill it. But understand what you actually have:** you built a genuinely sophisticated workflow engine — and then shipped its admin console as the product.

Your backend is better than most seed-stage SaaS I've seen: idempotency keys on webhooks, timing-safe signature verification, forced human-approval gates on inferred no-shows, credential vault with key rotation, k-anonymity floors on benchmarks, Inngest fan-out done correctly. That's 60% of the hard work and it's largely *right*.

The 30/100 rating is accurate — but it's not because the app is broken everywhere. It's because:

1. **Three specific defaults/bugs destroy the golden path** (detailed below — one config value alone is why your briefs are garbage)
2. **The UI renders your data model instead of your user's mental model.** Your database thinks in `runs`, `steps`, and `phases`. Your users think in *people*, *meetings*, and *money*. Every screen shows them the former.
3. **You have no empty-state design anywhere**, so a new account experiences the product at its absolute worst (n=0 audits, "Unknown" prospects, "No brief text generated").

This is a 6–10 week presentation-and-defaults crisis, not a rewrite. If you spend those weeks adding more infrastructure instead, then yes — kill it.

---

# Part 1: Root-Cause Diagnosis of Your Horror Stories

## Horror Story #1: "Pre-Call Reads running when turned off" — CONFIRMED BUG, here's the exact mechanism

Your crons **create the run before checking whether the skill is enabled.**

In `nightlyBriefsCron` (crons.ts), the eligibility filter checks booking platform, credentials, trigger type, and local hour — but **never calls `isSkillEnabledForEngagement`**. It then calls `startRun()` (creating a visible `skillRuns` row) and dispatches. Only later, inside `executeSkillRun` (skill.ts), does the enablement check happen — at which point it logs `"turned off for this engagement — nothing ran"` and calls `finishRun()`.

**Result:** the user sees a live execution appear, watches it "run," opens it, and gets told it never ran. That's your hide-and-seek. Worse:

- `finishRun()` marks it `status: "success"` — so **your dashboard's "Tasks Completed" counter is inflated by ghost runs of disabled skills.** Your vanity metric counts nothing happening.
- The same dispatch-then-check pattern exists in `leakMapScheduleCron`, `bookingPollCron` (booking-poller.ts), and the webhook worker (`booking-webhook.ts`).
- Meanwhile `processDynamicBriefEngagementCron` checks enablement *before* `startRun` — proof your own codebase knows the right pattern and applies it inconsistently.

**Fix:** Add a bulk helper (`getEngagementIdsWithSkillEnabled(skillId)` — one query, not N) and filter in every cron's prepare step **before** `startRun`. For the webhook path, write the roster row (correct — a booking is a fact) but never create a skill run for a disabled skill; at most write to a low-visibility audit log. Ghost runs must be structurally impossible, not filtered in the UI.

## Horror Story #2: "The brief is a terminal read" — the smoking gun is one config value

Open `submit-payload.ts`: every new engagement gets `person_match_confidence_threshold: 99`.

Now do the math against `person-match.ts`. Max score 100 requires **all four simultaneously**: a corporate email whose domain matches the typed company name (30) + a statistically distinctive surname (30) + a LinkedIn URL from the booking form (25) + a company field (15). Most booking forms collect *name and email*. A prospect with a Gmail address and a common surname scores near zero. Even a perfect corporate prospect without a LinkedIn URL caps at 75.

**At threshold 99, research runs for approximately nobody.** So your flagship "researched brief" pipeline skips research on ~100% of real bookings, the prompt is explicitly instructed to write "Research omitted" and leave Engagement History blank, and the user gets the hollow shell you described. Your best feature is disabled by your own default.

And it compounds:

- **You're dropping the highest-signal free data that exists.** You asked: *"Most people booking calls give us emails, phone numbers, and some rarely drop notes. I don't even know if we're able to extract notes."* You currently can't — `NormalizedCall` has no field for booking-form answers. Calendly's invitee payload carries `questions_and_answers` (the "what do you want to discuss?" field — the prospect telling you *in their own words why they booked*), and your pipeline discards it. This is the single cheapest, highest-impact brief improvement available and it requires zero AI.
- **"Unknown"** — your payload extraction falls back to `"Prospect"`/`"Unknown"` and that string leaks into run labels, drawers, and Slack. A brief that opens with "Unknown" is a trust-killer regardless of what follows.
- **Slack failure is handled backwards.** If `slack_webhook_url` was never configured, the run fails at *delivery time* — after burning tokens — and the user sees a failed run with raw internals. Missing delivery config should be a **pre-flight blocker** ("Pre-call briefs are paused: connect Slack or switch delivery to email — 30 seconds") surfaced in the Queue, and the run should never start.
- **The drawer shows raw internals:** "Identity Match: 30/100," "Delivery Channel: slack," "Synthesized Brief Content." That's your Rule 14 scoring engine leaking directly onto the screen.

## Horror Story #3: The webhook run reads like a machine log — because it is one

"Run started [Unknown <email> (polled)] — Roster updated — Enrolled Unknown in pre-call sequence — Sent rebooked exit signal (no-op if...)". Every one of those strings is a `logStep` label written by an engineer for an engineer, rendered verbatim. `(polled)`, `(Inngest)`, `webhook_received`, `no-op` — all shipping to users. You built `copy.ts` for exactly this purpose and then bypassed it in every `startRun`/`logStep` label.

Also: your app *can't* know the prospect was told not to attend — that's fine. What's not fine is that there's no way to attach a note to a meeting, and the presentation gives no human summary ("Sarah's Thursday call was booked → we started her 3-email pre-call sequence"). Which leads to the structural point:

**Your UI has no first-class Meeting or Prospect. Everything is a Run.** You already built the right table — `bookingRoster` — and its file comment even explains it exists to fix "the black-box problem." But the UI still centers runs. Invert this: **Meetings and Prospects are the product; runs are an audit trail behind a "History" disclosure.**

## Horror Story #4: The funnel audit with n=0 — statistically correct, product-illiterate

Your `insufficientData` gating in `audit-engine.ts` is genuinely good engineering (most competitors would happily alarm on n=2). But:

- **You run a full audit — LLM call included — on an engagement with zero data**, then render `[insufficient-data] ... (current n=0, prior n=0, floor=5)` — bracket-tagged internal gap strings — directly to the user.
- "Decisions: Assigned funnel health severity: none" is a developer writing to himself.
- The fix isn't better copy on the same report. It's **three report modes**: (a) *No data yet* → don't run the audit at all; produce a "Getting set up" state: what's connected, what will be measured, what's needed to start ("You need ~5 briefed calls before trends mean anything — you have 0. Here's what's blocking bookings from flowing in."); (b) *Healthy* → three sentences and one suggestion, not a metrics table; (c) *Issues found* → your LLM prompt **already generates** Issue | Severity | Likely Cause | Recommended Action | Expected Impact | Effort — and then `leak-map-view.tsx` dumps it into a `whitespace-pre-wrap` monospace box. Render those as action cards with "Fix this" links (you already built `classifyRunError` + `fixHref` deep-links for the Queue — reuse that pattern).

## Horror Story #5: The dashboard — you already have the intelligence, you're rendering the counters

"Active Accounts / Tasks Completed / Issues" tells nobody anything (and Tasks Completed is inflated by ghost runs, see above). Meanwhile you already have every data source a real briefing needs: `bookingRoster` (today's calls), `getQueueItems` (what needs a human), `winBackEnrollments` + `computeWinBackRevenueAttribution` (money), `skillRuns` (activity). The spec is in Part 2.

## Horror Story #6: Notifications — you have four concurrent pollers and still no urgency

On any dashboard page you're simultaneously running: BookingToast (5s), LiveCountBadge (5s), LiveExecutionFeed (5s), NotificationBell (30s). Four poll loops, and yet: no toast for critical failures, no badge for new queue items without a full navigation, and the bell buries criticals among FYIs. The fix is consolidation (one shared poll/SSE feeding toasts + badges + bell), not more infrastructure. This is real but it is **not your #1 problem** — pushback below.

## Horror Story #7 & #8 — covered in the redesigns (Part 2) and the Win-Back section specifically.

---

# Part 2: Code Audit — Defects You Didn't Mention But Should Know About

These are verified against the code you pasted, not vibes:

| # | Defect | Location | Severity |
|---|--------|----------|----------|
| 1 | **Approve/resolve endpoints are admin-only, but the Queue shows approvals to every customer.** `POST /api/actions/[id]/review` and `/api/blockers/[id]/resolve` require `isAdminEmail`. Your forced-gate sweep no-shows queue pending actions for tenants **who cannot act on them** — a 403 dead end. Works only while the sole user is you. | actions/review, blockers/resolve routes | **Critical for SaaS** |
| 2 | **The gear/quick-action menu is dead in all 5 module views.** `<ActionPanel open={false} onOpenChange={() => {}} ...>` — hardcoded shut. It can never open. Shipped five times via copy-paste. | pin-down/pile-on/pre-call-read/win-back/leak-map module views | High |
| 3 | **Win-Back revenue quarters are hardcoded to 2026.** `getPeriodOptions()` literally hardcodes Q1–Q4 2026. In January 2027 the flagship revenue view shows nothing. | win-back-revenue-section.tsx | High |
| 4 | **Broken redirect chain:** `/dashboard/credentials` → `/dashboard/settings?tab=credentials` → `settings/page.tsx` redirects to `/settings/profile`, dropping the tab. Library's "Settings → Booking Sync" link has the same fate. `settings-shell.tsx` appears orphaned. | credentials/page, settings/page, library/page | Medium |
| 5 | **`credentials-panel.tsx` is an empty file.** Shipped in the repo. | settings/credentials-panel.tsx | Hygiene |
| 6 | **Five ~700-line module views that differ by ~10 lines each**, plus THREE competing generations of the same component (`module-command-center.tsx`, `module-porfolio-shell.tsx` — filename typo included — and `shared-module-views.tsx`), at least two unmounted. This is thousands of lines of drift-prone duplication. | components/ | High (velocity killer) |
| 7 | **Hardcoded dark theme in module/pipeline views** (`text-zinc-100` on transparent backgrounds) inside an app with a light mode. In light mode, those pages are near-white text on white. You have ≥3 coexisting styling systems (zinc-hardcoded, Tailwind dark: tokens, `var(--text-primary)` inline styles). | module views, pipeline views, bridge pages | Medium |
| 8 | **Public confirmation page speaks robot to your buyer's prospects:** "Secure transmission link verified," "meeting parameters have been correctly recorded," "Showtime Telemetry Secured." This is a page a *cold prospect* sees. It reads like a sci-fi terminal, and it's competing with the 5 nice templates you built in `templates/` — the fallback route undersells the product. | confirm/[id]/page.tsx | Medium |
| 9 | **Engagement page fetches ALL runs unbounded** then slices to 20 in render. Also `deriveModuleStatus` maps a `running` run to "Not started yet." | engagements/[id]/page.tsx | Low/Medium |
| 10 | **Third-party branding in stored labels:** "Nightly cron (Inngest)", "Weekly cron (Inngest, UTC)", "(polled)", "Manually triggered via dashboard" are written into `skillRuns` labels and render as `subjectLabel` in feeds. `copy.ts` can't save you because the strings are persisted at write time. | crons.ts, booking-poller.ts | Medium |
| 11 | **Show-rate scorer + booking-form completeness features exist but the two best inputs are never wired** (`emailEngagementScore`, `applicationCompletenessRatio` always undefined). And the landing/marketing surface promises none of the genuinely differentiated stuff you built. | show-rate-scorer.ts | Low |

---

# Part 3: The Redesigns

## 3.1 What a Call Brief actually is (your ultimate question)

**A brief is a 30-second read that changes how the rep opens the call.** Not a research report, not a log. Concretely, five sections, always rendered — never "No brief text generated":

1. **Header** — Name, company/title (if verified), call time *in the rep's timezone* with countdown, meeting link, phone, one-tap "join / call / email."
2. **Why they booked** — their booking-form answers **verbatim** (extract `questions_and_answers` — see above), plus source ("Came in from your [Meta retargeting ad]" — you already built `getAdDataContextForTenant`; wire it visibly).
3. **What they've done** — a small timeline: booked 3 days ago, opened 2 of 3 emails, watched 60% of your video (Klaviyo + Wistia adapters already exist and already feed the prompt — surface them as UI, not just prompt fodder).
4. **How to open + what they'll push back on** — 2 openers, top 2 likely objections (from `topObjections`, increasingly CI-mined), one matched proof point.
5. **Watch out** — human-language risk flags: "Rescheduled once before," "Booked 10 minutes ago — low-commitment risk." Never "Identity Match: 30/100." Instead: *"Common name + personal email — we only used what they told us, nothing scraped."* That honesty line is a **feature**, not an apology.

Structural changes required: split research into **company-level** (domain-based, safe even for common names — always runs) vs **person-level** (Rule-14 gated, threshold dropped from 99 to a tiered ~70, paid enrichment gated higher). Store the brief as structured JSON sections, not a markdown blob, so Slack blocks and the dashboard card render the same object. Slack delivery becomes rich blocks with the outcome buttons you already have.

## 3.2 The Dashboard → daily briefing (all data already exists)

- **Row 1 — Today:** meetings from `bookingRoster` with brief-status chips and a "next call in 47 min" countdown. Empty state: "No calls today. 4 tomorrow — briefs go out tonight at 8pm."
- **Row 2 — Needs you:** top 3 `getQueueItems`, with the approve/dismiss action **inline** (post-fix #1 above).
- **Row 3 — This week vs last:** Bookings (Δ), Show rate, Briefs delivered, **$ recovered** (revenue-attribution). Deltas, not lifetime counts.
- **Row 4 — Wins feed:** "Sarah rebooked — $8,000 recovered" from `winBackEnrollments` exits.
- Live Executions moves off the front page to `/runs`. It's ops tooling, not the greeting.

## 3.3 Queue redesign

Three lanes: **Approve** (with the *reasoning* rendered — you already store `_reason` on sweep-gated actions; make it the headline), **Fix** (your `classifyRunError` diagnosis cards with deep links — this is genuinely your best UX pattern in the whole codebase; make it the template for everything), **FYI** (collapsed). Make review tenant-scoped (owner approves their own engagement's actions; admin override retained). Every approval must read like a colleague asking: *"Sarah missed Thursday's call, nobody logged an outcome, and there's no CRM activity. Start the 'sorry we missed you' recovery? [Yes] [She showed]."* You already generate exactly this sentence in `triggerNoShowWinBack` — it just dies in a notification instead of powering the UI.

## 3.4 Win-Back — lead with money

Your own comment in `revenue-attribution.ts` says it: *"'Win-Back recovered $84,000 this quarter' is the single sentence that turns 'a background service is running' into proof of value."* You wrote the module, then left it unmounted for months (per your own file comments) and hardcoded its quarters. Fixes: dynamic quarters; recovered-$ on the dashboard AND the engagement header; add **"at-risk pipeline"** = active enrollments × offer price ("$32,000 in recovery right now"); every recovery fires a win notification/toast. This number is your retention argument and your case-study generator.

---

# Part 4: Roadmap 30 → 90

**Phase 0 — Stop the bleeding (Week 1).** Ghost runs (enablement check before `startRun`, everywhere). Threshold 99 → tiered defaults + company-research-always. Extract booking-form Q&A into `NormalizedCall` and the brief. Slack/delivery misconfig → pre-flight queue blocker, not run failure. Strip Inngest/cron/polled/no-op from all persisted labels. Fix the five dead ActionPanels, the 2026 quarters, the redirect chain, delete the empty file. *Exit criteria: a brand-new engagement can go 7 days without seeing one internal term or one ghost run.* **→ ~45/100**

**Phase 1 — The Brief (Weeks 2–4).** Structured-section briefs, redesigned drawer + Slack blocks, guaranteed non-empty rendering, honesty lines instead of scores. Promote Meetings (roster) to the primary nav object; runs behind "History." **→ ~60**

**Phase 2 — Dashboard + Queue (Weeks 4–6).** Daily-briefing dashboard per spec; tenant-scoped approvals; consolidated poller → toasts for criticals + live badges. **→ ~70**

**Phase 3 — Audit + Win-Back money (Weeks 6–8).** Three-mode audits (no-data mode never runs the LLM); issue cards with fix links; revenue front-and-center; weekly email digest via existing Resend path. **→ ~78**

**Phase 4 — Consolidation (Weeks 8–10).** One generic module view replaces five + kill the three orphaned generations; one theming system; empty states everywhere; rewrite the public confirm page; onboarding restructured to "connect calendar → see tomorrow's calls in 5 minutes," everything else deferred to per-skill activation (your bridge-pages architecture already supports this — use it). **→ 82–85.** The last 10 points are earned, not built: validated show-rate model (you're already logging training data), integration breadth, and polish from real usage.

---

# Part 5: Pushbacks — where I disagree with you

1. **"Inngest could do much more."** No. Your orchestration layer is the *best* part of this codebase — the fan-out patterns, `waitForEvent` blockers, and checkpointing are already above-market. Zero ROI there. The gap is 100% in what you render. Do not touch it for a quarter.
2. **Notifications are not your #1 fire.** A perfect notification system announcing "Unknown enrolled in pre-call sequence" makes things *worse*. Fix the content, then the plumbing (consolidate the four pollers you already have).
3. **Stop the Asana cosplay.** You copy-pasted Asana's Calendar/List/Board triad onto every skill — ~15 view permutations — plus quarterly "milestone cards" with decorative pink avatars mimicking screenshots. Sales tools are **answer-first**, not project-management chrome. Each skill needs *one* correct view (Meetings→calendar+list, Win-Back→pipeline+$, Audit→report). Cut the rest; every extra view is drift surface (see defect #6).
4. **Wrong comparison set.** Grok is a category error and I can't meaningfully benchmark you against products I can't verify exist. Your real comps: **Gong/Fireflies/Attention** (call intelligence), **Clay/Apollo** (enrichment), **Momentum** (workflow), plus generic no-show-reminder tools. Your defensible wedge — which *none* of them own end-to-end — is the **closed loop: booking → brief → outcome → recovery → attributed dollars**. Fireflies knows what happened on calls; you can know what happened *around* them and prove the revenue. That's the positioning. Lead every surface with the money.
5. **Feature freeze.** No new skills, no new platform adapters, until Phase 3 ships. Your codebase's own comments show a pattern of building complete features (revenue attribution, pipelines, WinBackRevenueSection) and never mounting them. You don't have a building problem. You have a shipping-the-last-mile problem — and the roadmap above *is* the last mile.

**Bottom line:** the engine is real, the defaults sabotage it, and the interface narrates the machine instead of serving the human. Fix those three things in that order and this is a fundamentally different product in ten weeks.