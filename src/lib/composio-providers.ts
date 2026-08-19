/**
 * Which of this app's internal provider keys have real, Composio-supported
 * OAuth — split out of composio.ts (which imports @composio/core, a
 * server-only package) so client components can check
 * isComposioManagedProvider() to decide whether to show a "Connect" option
 * without pulling that dependency into the browser bundle.
 *
 * composio.ts re-exports everything here for backward compatibility with
 * existing server-side imports — this file is the single source of truth,
 * not a duplicate to keep in sync by hand.
 */
export const PROVIDER_TOOLKIT_MAP: Record<string, string> = {
  calendly: "calendly",
  hubspot: "hubspot",
  klaviyo: "klaviyo",
  mailchimp: "mailchimp",
  // GoHighLevel: this app reuses the booking-slot credential (ghl_calendar)
  // for both booking and email/CRM use — see the "GoHighLevel CRM actions
  // reuse the Location ID set under Booking above" comment in
  // edit-stack-settings.tsx. One Composio connection covers both.
  ghl_calendar: "highlevel",
};

export function isComposioManagedProvider(provider: string): boolean {
  return provider in PROVIDER_TOOLKIT_MAP;
}

export function toolkitSlugForProvider(provider: string): string | null {
  return PROVIDER_TOOLKIT_MAP[provider] ?? null;
}
