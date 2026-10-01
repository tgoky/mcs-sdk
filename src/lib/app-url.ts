// src/lib/app-url.ts
//
// The app's public address, for links in emails/Slack and for webhook
// addresses registered with other services. There is deliberately no
// fallback: a missing NEXT_PUBLIC_APP_URL used to quietly fall back to an
// old deployment that no longer exists, so links and webhooks went to a
// dead address with no error anywhere.

/** NEXT_PUBLIC_APP_URL without a trailing slash, or null when it isn't set. */
export function getAppUrlOrNull(): string | null {
  const value = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");
  return value ? value : null;
}

/** NEXT_PUBLIC_APP_URL without a trailing slash. Throws when it isn't set. */
export function getAppUrl(): string {
  const value = getAppUrlOrNull();
  if (!value) {
    throw new Error("NEXT_PUBLIC_APP_URL is not set. Set it to this app's public address (e.g. https://app.example.com) so links and webhooks point somewhere real.");
  }
  return value;
}
