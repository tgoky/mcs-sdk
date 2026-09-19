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
 * Deliberately narrower than credential-health.ts's own VALIDATORS map
 * (the daily cron): that one also covers ghl_calendar and
 * whop_bot_api_key, which /api/credentials/test does not yet — a real,
 * pre-existing gap between the manual "test now" button and the automatic
 * daily check, noted here rather than silently worked around by claiming
 * those two are testable when the route would 400 on them today.
 */
export const TESTABLE_CREDENTIAL_PROVIDERS = [
  "calendly",
  "cal_com",
  "mailchimp",
  "convertkit",
  "smtp",
  "cold_open_instantly",
  "cold_open_smartlead",
  "cold_open_lemlist",
  "cold_open_reply_io",
  "cold_open_apify",
];

export function isTestableCredentialProvider(provider: string): boolean {
  return TESTABLE_CREDENTIAL_PROVIDERS.includes(provider);
}
