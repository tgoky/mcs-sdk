// src/lib/safe-fetch.ts
//
// Fetches a URL that came from a user or a data file (a lead CSV's domain,
// an operator-entered bridge destination) without letting it reach this
// server's own network: loopback, private ranges, link-local (including
// cloud metadata at 169.254.169.254), and similar are refused, both for the
// first URL and for every redirect hop, which is followed by hand so each
// hop is checked.
//
// Limit: the host is resolved once for the check and again by fetch itself,
// so a DNS answer that changes between the two (rebinding) isn't caught.
// That needs a pinned-IP agent; this closes the direct cases.

import { lookup } from "dns/promises";
import { isIP } from "net";

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

function ipv4Blocked(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local, cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224 // multicast, reserved, broadcast
  );
}

function ipv6Blocked(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v === "::" || v === "::1") return true;
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return ipv4Blocked(mapped[1]);
  return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v);
}

export function isBlockedAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return ipv4Blocked(ip);
  if (family === 6) return ipv6Blocked(ip);
  return true;
}

/** Throws UnsafeUrlError unless the URL is http(s) to a public host. */
export async function assertPublicUrl(raw: string, opts: { httpsOnly?: boolean } = {}): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError("Not a valid URL.");
  }
  if (url.protocol !== "https:" && (opts.httpsOnly || url.protocol !== "http:")) {
    throw new UnsafeUrlError(opts.httpsOnly ? "Only https:// URLs are allowed." : "Only http(s) URLs are allowed.");
  }
  if (url.username || url.password) throw new UnsafeUrlError("URLs with credentials aren't allowed.");

  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    throw new UnsafeUrlError("That host isn't reachable from here.");
  }
  if (isIP(host)) {
    if (isBlockedAddress(host)) throw new UnsafeUrlError("That address isn't reachable from here.");
    return url;
  }
  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new UnsafeUrlError(`Couldn't resolve ${host}.`);
  }
  if (addresses.length === 0 || addresses.some((a) => isBlockedAddress(a.address))) {
    throw new UnsafeUrlError("That address isn't reachable from here.");
  }
  return url;
}

/**
 * fetch() for untrusted URLs: every hop checked by assertPublicUrl, a
 * timeout on the whole exchange, and at most `maxRedirects` redirects.
 * A redirect off a POST is followed as a GET without a body, the way
 * browsers do for 301/302/303.
 */
export async function safeFetch(
  raw: string,
  init: RequestInit = {},
  opts: { timeoutMs?: number; maxRedirects?: number; httpsOnly?: boolean } = {}
): Promise<Response> {
  const { timeoutMs = 10_000, maxRedirects = 3, httpsOnly = false } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let current = raw;
    let request: RequestInit = init;
    for (let hop = 0; ; hop++) {
      const url = await assertPublicUrl(current, { httpsOnly });
      const res = await fetch(url, { ...request, redirect: "manual", signal: controller.signal });
      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && location) {
        if (hop >= maxRedirects) throw new UnsafeUrlError("Too many redirects.");
        current = new URL(location, url).toString();
        if (res.status !== 307 && res.status !== 308) {
          request = { ...request, method: request.method === "HEAD" ? "HEAD" : "GET", body: undefined };
        }
        continue;
      }
      return res;
    }
  } finally {
    clearTimeout(timer);
  }
}
