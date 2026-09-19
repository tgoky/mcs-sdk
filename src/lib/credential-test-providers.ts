/**
 * Providers /api/credentials/test has a real, verified "am I still
 * authenticated" check for — split out as a client-safe list (mirrors
 * composio-providers.ts's own reasoning) so CredentialRow can decide
 * whether to show a "Test connection" action without importing the route's
 * VALIDATORS map itself, which pulls in server-only platform clients.
 *
 * Hand-kept in sync with the VALIDATORS keys in
 * src/app/api/credentials/test/route.ts — there's no way around that
 * without exporting real validator functions into a shared client+server
 * module, which isn't worth it for a list this short. If that route's
 * VALIDATORS map changes, update this list in the same commit.
 *
 * Was deliberately narrower than credential-health.ts's own VALIDATORS map
 * (the daily cron) — missing ghl_calendar, whop_bot_api_key, twilio, then
 * hyros — until each gap was closed in the route directly; now matches it
 * exactly. Each of those had a real checkCredentialHealth() already
 * written on its platform client (booking.ts, whop-agent/probe.ts,
 * sms.ts, ad-data.ts respectively) that just was never wired into either
 * health check path — not new/unverified code, just closing real gaps.
 *
 * Left out deliberately, not missed: apollo and pdl (pre-call-read's
 * prospect-research BYOK sources) have no cheap liveness endpoint in this
 * codebase — their only real calls (enrichViaApollo/enrichViaPdl) are
 * paid, per-lookup enrichment requests billed against the buyer's own
 * account. Wiring either into a health check that runs daily (and on
 * every manual "Test connection" click) would mean silently spending the
 * buyer's own money just to confirm a key works — the same silent-cost
 * risk this whole plan exists to prevent, not something to introduce
 * while closing an unrelated gap.
 */
export const TESTABLE_CREDENTIAL_PROVIDERS = [
  "calendly",
  "cal_com",
  "mailchimp",
  "convertkit",
  "smtp",
  "ghl_calendar",
  "twilio",
  "hyros",
  "whop_bot_api_key",
  "cold_open_instantly",
  "cold_open_smartlead",
  "cold_open_lemlist",
  "cold_open_reply_io",
  "cold_open_apify",
];

export function isTestableCredentialProvider(provider: string): boolean {
  return TESTABLE_CREDENTIAL_PROVIDERS.includes(provider);
}
