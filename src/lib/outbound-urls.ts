// src/lib/outbound-urls.ts
//
// Addresses a person types in that the server later calls. Each is held to
// the one host it can really be, so a typed address can't point the
// server at something else (an internal service, another site).

/** An ActiveCampaign API base: https on the account's own
 * <account>.api-usN.com or <account>.activehosted.com host. Returns it
 * without a trailing slash, or null. */
export function activeCampaignApiBase(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  if (!/^[a-z0-9][a-z0-9-]*\.(api-us\d+\.com|activehosted\.com)$/i.test(url.hostname)) return null;
  return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
}

/** A Slack incoming-webhook address: https://hooks.slack.com/... only. */
export function slackWebhookUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const url = new URL(raw.trim());
    return url.protocol === "https:" && url.hostname === "hooks.slack.com" && !url.port && !url.username ? url.toString() : null;
  } catch {
    return null;
  }
}

export const ACTIVECAMPAIGN_URL_HINT = "Use your ActiveCampaign API address, like https://youraccount.api-us1.com/api/3.";
