# Cold Open Skill Pack (v0.2.1) — Fit Review

## The verdict first

This isn't a random third-party plugin someone found — it's built by the same
shop, in the same lineage, on purpose. `lib/esp/base.py`'s own docstring says
it's a "port of the outreach system's `instantly_pusher.py`," and
`lib/config.py` says its config file "follows... Showtime's
`showtime.config.md` convention." Cold Open is the next **OG Skill Pack** —
the same kind of standalone, buyer-run Claude Skill that pin-down, win-back,
pile-on, leak-map, and every Reputation Manager worker in this codebase
*started life as*, before Mudd Ventures inverted them into hosted, multi-tenant
`src/features/*/server` workers running on Postgres + Inngest (see
`rep-thresholds.ts`'s "ported from the OG Claude Skill Pack," `approval-gate.ts`'s
"The Skill Pack's install-time agent," `doc-researcher.ts`, and
`export-to-skill-pack.ts`'s explicit framing of "the Skill Pack promise this
app inverted").

**It does not plug into the runtime today, and it shouldn't be forced to.**
It's Python, config-file-driven, explicit-invocation, and — per its own
README — deliberately runs on nothing but the buyer's own Claude Code/Cowork
session and their own ESP/Apify accounts: *"Nothing runs on Mudd Ventures
infrastructure."* That's not a gap to close; it's the same
`runtime_ownership_model: "buyer_exported"` story this codebase already
treats as first-class (`schema.ts:277,451-465`, checked in
`win-back-sms.ts:48` and `win-back-email-smtp.ts:47`) — except Cold Open
ships buyer-owned from day one instead of being exported out of a hosted
worker later.

The right move now is small: list it in the Library as a free, buyer-run
product. The right move *later*, if Mudd Ventures wants a hosted "Cold Open"
worker sitting next to pile-on/win-back, is a real, separately-scoped
inversion project — not a file copy. Details below.

---

## 1. What it is

A seven-skill Claude Code/Cowork plugin (`.claude-plugin/plugin.json`,
`skills/*/SKILL.md`) that stands up cold-email outbound entirely inside the
buyer's own stack:

| # | Skill | Does |
|---|---|---|
| 1 | `icp-lock` | Interviews the buyer, seeds `coldopen.config.md` — the cross-skill spine every other skill reads |
| 2 | `voice-capture` | Crawls the buyer's site or ingests templates for greeting/sign-off voice |
| 3 | `source-connect` | Wires a lead source: Apify actor, CSV, or Sales Nav export |
| 4 | `send-connect` | Wires an ESP (Instantly/SmartLead/Reply.io/Lemlist), maps ICPs to campaigns |
| 5 | `daily-send` | Installs the recurring fetch → filter → personalize → push → report loop |
| 6 | `reply-sort` | Classifies replies (interested/not-now/not-a-fit/objection/auto-reply/unsubscribe) |
| 7 | `send-report` | Weekly/monthly send-and-reply analytics |

Backing library (`lib/`, pure Python, `pyyaml` + `beautifulsoup4` + `anthropic`
as its only three dependencies): an `ESPAdapter` base class with idempotency,
review-gating, and dry-run-by-default push machinery
(`lib/esp/base.py`); four ESP adapters; Apollo/Apify/CSV/Sales-Nav fetchers;
a Haiku-based reply classifier with deterministic pre-LLM guards
(`lib/classify/reply_classifier.py`); a liveness check before spending on a
dead domain (`lib/business_status.py`); an SPF/DKIM/DMARC gap-checker split
into a pure/testable half and a live-DNS half (`lib/dns_validator.py`); and a
deterministic MD5-based rotation primitive shared by subject- and
body-variant selection (`lib/hash_rotation.py`) so the same lead always gets
the same variant while consecutive leads land on different ones — a direct
back-port of an internal audit finding (documented in the file itself) that
one fixed template ran ~93% identical across 9 leads in a week.

The engineering bar matches this codebase's own: deterministic guards before
LLM spend, dry-run defaults, idempotency keys, pure-vs-live test splits,
failure-isolated batches, and comments that cite their own audit lineage
rather than asserting behavior. This is not a rough drop-in; it's production
quality by the same standard `AI_ARCHITECT_REPORTfe.md` applied to the rest
of this app.

## 2. Where it would sit in this app's own worker taxonomy

Every worker this app hosts today (`src/lib/worker-registry.ts`) starts
**after** a call is already booked — `pin-down` sets up the engagement,
`pile-on`/`win-back` are categorized `"Outreach & Sequences"` but both operate
on people who already exist in `bookingRoster`. Nothing in this app creates
the lead in the first place. Cold Open is exactly that missing upstream
stage: cold lead → filtered to ICP → sequenced → booked. It would extend this
app's own stated moat — "the closed loop: booking → brief → outcome →
recovery → attributed dollars" (`AI_ARCHITECT_REPORTfe.md`) — one stage
further left, to "cold lead → booking → brief → outcome → recovery →
attributed dollars." That's a meaningfully bigger story than the plugin's own
positioning suggests, and worth flagging to whoever owns Library curation.

Conceptually it's a third `"Outreach & Sequences"` worker; practically, it
runs on a different guest — the buyer's own Claude session — not this app's
Inngest, so it can't just be dropped into `WORKER_REGISTRY` next to
`pile-on` and `win-back` without the same inversion work every existing
worker already went through.

## 3. Architecture delta — why it can't just be imported

| Dimension | This app's hosted workers | Cold Open |
|---|---|---|
| Runtime | TypeScript / Next.js API routes | Python 3, invoked inside Claude Code/Cowork |
| Orchestration | Inngest crons + fan-out (`src/inngest/crons.ts`, `skill.ts`) | Claude Code's own recurring-run install (`daily_send.py install`) |
| State | Postgres via Drizzle (`engagements`, `EngagementStack` jsonb) | One markdown+YAML file per engagement (`coldopen.config.md`) + a local `runs/` folder |
| Credentials | `credential-vault` (rotation, timing-safe webhook verification, admin UI — `src/app/api/credential-vault`) | `env://VAR_NAME` refs into a git-ignored `.env` (`lib/esp/base.py:resolve_credential`) |
| Multi-tenancy | One Postgres row + one workspace per client, enforced server-side | One folder per engagement, isolation is filesystem-level, buyer-operated |
| Trigger model | Cron-eligible, enablement-gated before `startRun` (see Horror Story #1 in `AI_ARCHITECT_REPORTfe.md`) | Explicit invocation only (`disable-model-invocation: true` in every `SKILL.md`) |
| Hosting cost to Mudd Ventures | Real — DB rows, Inngest steps, LLM spend on Mudd's keys in some paths | None — buyer's Claude session, buyer's API keys throughout |

None of this is a defect in the plugin — it's the deliberate trade this app's
own `export-to-skill-pack.ts` already documents as a real, valuable *option*
(buyer-owned = zero hosting cost and zero lock-in, at the price of losing the
dashboard/brief/queue experience this app wraps around a hosted worker).

## 4. Naming and concept collisions worth resolving before this ships in the Library

- **"Skill" now means three different things** in this org's vocabulary: a
  hosted `WorkerId` (`skill-manifest.ts`), a `SkillPackExportBundle` (the
  buyer-export artifact `export-to-skill-pack.ts` produces), and a Claude
  Skill inside a plugin like this one (`skills/*/SKILL.md`). Cold Open's own
  README compounds it by calling itself a "seven-skill... plugin." Worth a
  one-line disambiguation note wherever Cold Open is described alongside the
  rest of the product line — a buyer reading both "Win-Back Skill Pack
  export" and "Cold Open skill pack" back to back has no way to know these
  are structurally unrelated without someone saying so.
- **Two independent ESP-adapter implementations exist in the org now**:
  `src/lib/platforms/email.ts` (hosted, Mudd-operated) and
  `lib/esp/{instantly,smartlead,lemlist,reply_io}.py` (buyer-operated, inside
  this plugin). They don't conflict today because they run in different
  places for different owners — but if this ever becomes a hosted worker,
  the TS side should read `lib/esp/*.py`'s adapter contract
  (`_campaigns_request`, `_push_request`, `build_payload`, `validate_config`)
  as the reference spec rather than re-deriving it, the same way
  `rep-thresholds.ts` explicitly ports its OG pack's defaults instead of
  guessing new ones.
- **Genuine reuse opportunity, not just a collision**: `icp-lock`'s
  `product_identity`/`icps` and `voice-capture`'s voice profile are exactly
  what `pin-down`'s `offerIcp` and `rawVoiceCorpus` (`derivable` from
  `primaryDomain`, per `worker-registry.ts:156-160`) already capture for a
  client that has *also* set up pin-down. A future hosted Cold Open worker
  should be `derivable` from those same fields via
  `client-profile.ts`'s resolver, not re-ask a client who's already run
  pin-down for their ICP a second time.

## 5. Recommended near-term step

List it in the Library as a **free, buyer-run product** — not a worker.
This matches the plugin's own positioning exactly ("Currently free to use,"
"Nothing runs on Mudd Ventures infrastructure"), costs Mudd Ventures nothing
to host (no DB rows, no Inngest steps, no LLM spend on Mudd's own keys), and
is the same shape as the `paste_ready_bundle` export path this app already
built and shipped for Win-Back — except here the buyer starts owned from
day one instead of getting exported out of a hosted version later. Concretely
that's a Library card (`product-card.tsx`) linking to the `.plugin` file and
install instructions, sourced straight from `plugin.json`'s own name/
description/keywords — no schema changes, no new `WorkerId`, no credential
vault work.

## 6. If/when a hosted "Cold Open" worker is wanted later

This is a real, separately-scoped project — the same size of effort every
other OG-pack-to-worker inversion in this codebase already was — not a
follow-up to the Library listing above. It would need, at minimum:

1. A new `WorkerId` (or a small family — fetch/personalize/push could stay
   one worker; reply-sort and send-report are plausibly their own, mirroring
   how Reputation Manager split into 6 workers off one `rep-onboarding`).
2. `EngagementStack` fields mirroring `coldopen.config.md`'s frontmatter —
   `icps`, `sizing_bounds`, `lead_sources`, `send_platform`, `campaign_map` —
   plus `worker-registry.ts` entries reusing `pin-down`'s `offerIcp`/
   `rawVoiceCorpus` as `derivable` per point 4 above.
3. An Inngest cron for the daily batch (`daily_send.py run`'s pipeline —
   fetch → dedupe → personalize → assemble → push → report — maps cleanly
   onto this app's existing step-function style in `src/inngest/crons.ts`).
4. Credential-vault entries for Instantly/SmartLead/Reply.io/Lemlist/Apify,
   replacing `env://VAR_NAME` resolution with `resolveCredential` the way
   every other hosted worker already does.
5. A decision on LLM spend ownership (buyer's Anthropic key today via
   `requirements.txt`'s `anthropic` dependency; a hosted version puts that
   spend on Mudd Ventures' books, same tradeoff `AI_ARCHITECT_REPORTfe.md`
   flags elsewhere).

None of this should be guessed at without a product/pricing call from
whoever owns the roadmap — it's flagged here as the real next step, not
attempted in this pass.

## 7. One real risk worth flagging regardless of path

`lib/classify/reply_classifier.py` and `lib/personalize/engines.py` both call
out to Anthropic directly from the buyer's own key/session. If Cold Open is
promoted in the Library as an official Mudd Ventures product, buyers will
reasonably expect the same standard of "no silent LLM spend" this app already
holds itself to elsewhere (see Horror Story #2's Slack-misconfiguration
point). The plugin already gets this right internally — deterministic guards
before any model call, explicit dry-run default, per-run cost reporting in
`daily_send.py`'s batch report — so this is a documentation note for the
Library listing, not a code fix: make the "your Anthropic key, your spend"
fact as visible on the product card as it already is inside the plugin's own
`SKILL.md` files.
