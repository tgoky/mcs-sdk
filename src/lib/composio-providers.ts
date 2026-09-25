/**
 * Which of this app's internal provider keys can offer "Sign in" through
 * Composio — split out of composio.ts (which imports @composio/core, a
 * server-only package) so client components can check
 * isComposioManagedProvider() to decide whether to show a "Connect" option
 * without pulling that dependency into the browser bundle.
 *
 * composio.ts re-exports everything here for backward compatibility with
 * existing server-side imports — this file is the single source of truth,
 * not a duplicate to keep in sync by hand.
 *
 * Sign in only works where Composio has an OAuth app to send the person
 * to. Composio provides that app itself for some toolkits ("managed
 * auth"); for the rest, connecting fails with
 * Auth_Config_DefaultAuthConfigNotFound unless we register our own OAuth
 * app with the provider and add it to Composio as a custom auth config.
 * Checked against Composio's own toolkit data (composio_managed_auth_schemes
 * in ComposioHQ/composio docs/public/data/toolkits.json, Sep 2026):
 *
 *   calendly, hubspot, mailchimp, slack   managed OAuth2
 *   klaviyo, highlevel                    no managed OAuth: needs our own app
 *
 * Every other provider in the app is paste-a-key and never goes through
 * Composio.
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
  // Sign in with Slack, as an alternative to a per-client incoming webhook
  // (src/lib/slack-delivery.ts).
  slack: "slack",
};

/** Toolkits whose OAuth app Composio provides. */
const COMPOSIO_MANAGED = new Set(["calendly", "hubspot", "mailchimp", "slack"]);

/**
 * Our own Composio auth config (the "ac_..." id from Composio's dashboard,
 * created with our own OAuth app's client id and secret), per toolkit.
 * Required for a toolkit Composio doesn't manage; optional for the others
 * (it replaces Composio's app, e.g. to show our name on the consent screen).
 *
 * NEXT_PUBLIC_ because client components read this to decide whether to
 * show Sign in; an auth config id is an identifier, not a secret (the
 * client secret stays in Composio). Each is read by its literal name so
 * Next.js can inline it into the browser bundle.
 */
const CUSTOM_AUTH_CONFIG_IDS: Record<string, string | undefined> = {
  calendly: process.env.NEXT_PUBLIC_COMPOSIO_AUTH_CONFIG_CALENDLY,
  hubspot: process.env.NEXT_PUBLIC_COMPOSIO_AUTH_CONFIG_HUBSPOT,
  klaviyo: process.env.NEXT_PUBLIC_COMPOSIO_AUTH_CONFIG_KLAVIYO,
  mailchimp: process.env.NEXT_PUBLIC_COMPOSIO_AUTH_CONFIG_MAILCHIMP,
  highlevel: process.env.NEXT_PUBLIC_COMPOSIO_AUTH_CONFIG_HIGHLEVEL,
  slack: process.env.NEXT_PUBLIC_COMPOSIO_AUTH_CONFIG_SLACK,
};

export function toolkitSlugForProvider(provider: string): string | null {
  return PROVIDER_TOOLKIT_MAP[provider] ?? null;
}

/** Our own auth config id for this provider's toolkit, when one is set. */
export function customAuthConfigIdForProvider(provider: string): string | null {
  const slug = toolkitSlugForProvider(provider);
  const id = slug ? CUSTOM_AUTH_CONFIG_IDS[slug]?.trim() : undefined;
  return id ? id : null;
}

/** Whether "Sign in" can actually complete for this provider. */
export function isComposioManagedProvider(provider: string): boolean {
  const slug = toolkitSlugForProvider(provider);
  if (!slug) return false;
  return COMPOSIO_MANAGED.has(slug) || customAuthConfigIdForProvider(provider) !== null;
}
