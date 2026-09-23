// src/lib/whop-agent/url.ts
//
// Where Whop's REST API lives. No imports, so anything can use it.

export const WHOP_API_BASE = "https://api.whop.com";

/**
 * The full URL for a Whop API path. Whop's REST v1 lives under /api/v1
 * (https://api.whop.com/api/v1 is the base in every official SDK:
 * @whop/sdk for TypeScript and whop_sdk for Python). Call sites write v1
 * paths as "/v1/...", so they gain the /api prefix here; the v2 and v5
 * paths already carry it.
 */
export function whopApiUrl(path: string): string {
  return `${WHOP_API_BASE}${path.startsWith("/v1/") ? `/api${path}` : path}`;
}
