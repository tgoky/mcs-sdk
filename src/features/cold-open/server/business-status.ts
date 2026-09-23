// src/features/cold-open/server/business-status.ts
//
// Cheap liveness check before spending on a lead. Port of the Cold Open
// skill pack's business_status.py: cold outreach to a dead company is
// wasted spend on every level (LLM extraction, ESP quota, sender
// reputation from the bounce). One HTTPS HEAD per unique domain (bare/www/
// http variant fallbacks) answers it before the pipeline commits.
//
// Note the difference from a scraper's own dead-site fallback: this check
// exists to not email confirmed-dead domains at all, not to decide what
// content to write for a live-but-thin site.

import { safeFetch } from "@/lib/safe-fetch";

const ALIVE_STATUS_CODES = new Set([200, 201, 202, 203, 204, 301, 302, 303, 307, 308, 401, 403]);
const HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; ColdOpen/1.0)", Accept: "*/*" };

export interface DomainLiveness {
  alive: boolean;
  status: number | string;
  url: string;
}

async function headWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  // The domain comes from a lead file, so it's fetched through safeFetch:
  // a row like "169.254.169.254" or "localhost:3000" is refused instead of
  // reaching this server's own network, on the first hop and every redirect.
  return safeFetch(url, { method: "HEAD", headers: HEADERS }, { timeoutMs, maxRedirects: 5 });
}

/** A lead's domain as a bare public hostname ("https://www.Acme.com/about"
 * -> "www.acme.com"), or null when it isn't one — IP addresses, ports and
 * single-label names ("localhost") are never a company website. */
export function normalizeLeadDomain(raw: string): string | null {
  const host = (raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .split(/[/?#]/)[0];
  if (!/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host)) return null;
  return host;
}

/** One domain -> liveness result. Tries https://<domain>, https://www.<domain>,
 * then http://<domain> in order, same fallback chain as the source check. */
export async function verifyDomain(domain: string, timeoutMs = 8000): Promise<DomainLiveness> {
  if (!(domain ?? "").trim()) return { alive: false, status: "no-domain", url: "" };
  const d = normalizeLeadDomain(domain);
  if (!d) return { alive: false, status: "invalid-domain", url: "" };

  let lastErr = "unreachable";
  for (const url of [`https://${d}`, `https://www.${d}`, `http://${d}`]) {
    try {
      const res = await headWithTimeout(url, timeoutMs);
      if (ALIVE_STATUS_CODES.has(res.status)) {
        return { alive: true, status: res.status, url: res.url || url };
      }
      lastErr = `status ${res.status}`;
    } catch (err) {
      lastErr = `err:${err instanceof Error ? err.message : String(err)}`;
    }
  }
  return { alive: false, status: lastErr, url: "" };
}

/** Concurrent liveness over unique domains -> Map(domain -> result). Caps
 * concurrency at `workers` in-flight checks, same reasoning the source
 * module's ThreadPoolExecutor cap gives (don't hammer a lead's own domain
 * pool harder than a small fetch batch needs to). */
export async function verifyDomains(domains: string[], timeoutMs = 8000, workers = 12): Promise<Map<string, DomainLiveness>> {
  const uniq = Array.from(new Set(domains.filter(Boolean).map((d) => d.trim().toLowerCase()))).sort();
  const out = new Map<string, DomainLiveness>();
  if (uniq.length === 0) return out;

  let cursor = 0;
  async function worker() {
    while (cursor < uniq.length) {
      const domain = uniq[cursor++];
      out.set(domain, await verifyDomain(domain, timeoutMs));
    }
  }
  await Promise.all(Array.from({ length: Math.min(workers, uniq.length) }, () => worker()));
  return out;
}
