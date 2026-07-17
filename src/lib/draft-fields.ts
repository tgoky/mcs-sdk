/**
 * Field names on the "new engagement" wizard's FormData that must never be
 * persisted anywhere except transient in-memory component state — not to
 * sessionStorage, and not to the server-side draft row.
 *
 * Used from two places that must agree on this list:
 *   - src/app/dashboard/engagements/new/page.tsx (client, before writing to
 *     sessionStorage and before POSTing a draft snapshot to the server)
 *   - src/app/api/engagements/draft/route.ts (server, strips again
 *     defensively — the API route never trusts that the client actually
 *     stripped these before sending)
 *
 * If a new API-key-shaped field is added to the wizard's FormData, add its
 * key here too, or it will get written into the engagement_drafts table in
 * plaintext.
 */
export const DRAFT_SECRET_FIELD_NAMES = [
  "bookingApiKey",
  "emailApiKey",
  "hostingApiKey",
  "smsApiKey",
  "adDataApiKey",
  "videoEngagementApiKey",
  "apolloApiKey",
  "pdlApiKey",
] as const;

/**
 * Returns a shallow copy of `data` with every key in
 * DRAFT_SECRET_FIELD_NAMES removed. Safe to call on already-stripped data
 * (removing an absent key is a no-op).
 */
export function stripDraftSecrets<T extends object>(data: T): Partial<T> {
  const out = { ...data } as Record<string, unknown>;
  for (const key of DRAFT_SECRET_FIELD_NAMES) {
    delete out[key];
  }
  return out as Partial<T>;
}
