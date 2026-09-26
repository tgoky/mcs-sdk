// src/lib/ghl-providers.ts
//
// The pure GoHighLevel provider helpers, kept apart from ghl-location.ts so
// client components can use them without pulling the database into the
// browser bundle.

export const GHL_PROVIDERS = ["ghl_calendar", "ghl"] as const;

export function isGhlProvider(provider: string): boolean {
  return (GHL_PROVIDERS as readonly string[]).includes(provider);
}

/** The other half of GoHighLevel: one token covers booking and email/CRM. */
export function otherGhlProvider(provider: string): string | null {
  return provider === "ghl" ? "ghl_calendar" : provider === "ghl_calendar" ? "ghl" : null;
}
