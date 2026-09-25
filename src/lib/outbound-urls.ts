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

/**
 * The datacenter a Mailchimp API key lives on ("us21" from "...-us21"), which
 * becomes the API's host (https://<dc>.api.mailchimp.com). Only the real
 * shape is accepted, so a crafted key can't steer the request to another
 * host (a suffix like "evil.com#" would otherwise land in the hostname).
 */
export function mailchimpDatacenter(apiKey: unknown): string | null {
  if (typeof apiKey !== "string") return null;
  const key = apiKey.trim();
  const i = key.lastIndexOf("-");
  if (i <= 0) return null;
  const dc = key.slice(i + 1).toLowerCase();
  return /^[a-z]{2}\d{1,3}$/.test(dc) ? dc : null;
}

/** A Mailchimp API endpoint returned by its OAuth metadata: https on a
 * <dc>.api.mailchimp.com host only. Returns the origin, or null. */
export function mailchimpApiEndpoint(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:" || url.port || url.username || url.password) return null;
    return /^[a-z]{2}\d{1,3}\.api\.mailchimp\.com$/i.test(url.hostname) ? url.origin : null;
  } catch {
    return null;
  }
}

export const ACTIVECAMPAIGN_URL_HINT = "Use your ActiveCampaign API address, like https://youraccount.api-us1.com/api/3.";
