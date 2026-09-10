// src/features/cold-open/server/dns-validator.ts
//
// SPF / DKIM / DMARC gap check at mailbox-add time. Port of the Cold Open
// skill pack's dns_validator.py — Send Connect runs this when the buyer
// adds a sending domain and WARNS on gaps with an exact fix path; it
// never refuses to add the mailbox (the buyer may fix DNS after
// connecting — blocking would just strand them).
//
// Two layers, same split as the source module:
//   - PURE: validateDomain(spfTxts, dkimTxt, dmarcTxt, expectedIncludes)
//     -> Gap[] (parses records — this is what's worth unit testing)
//   - LIVE: validateDomainLive(domain, provider?, selectors?) -> Gap[]
//     (resolves via Node's built-in dns module; resolution failure ->
//     one advisory Gap, never a throw — same never-raises contract the
//     source module's LIVE layer holds itself to)
//
// SPF alignment for a relay-through-your-own-mailbox ESP (Instantly,
// SmartLead, Reply.io, Lemlist) is really about the MAILBOX provider
// (Google/M365/Zoho/SES), not the ESP brand — the include hint is
// provider-derived, not ESP-derived.

import { resolveTxt } from "dns/promises";

const PROVIDER_SPF_INCLUDES: Record<string, string> = {
  google: "_spf.google.com",
  google_workspace: "_spf.google.com",
  gsuite: "_spf.google.com",
  m365: "spf.protection.outlook.com",
  microsoft365: "spf.protection.outlook.com",
  office365: "spf.protection.outlook.com",
  outlook: "spf.protection.outlook.com",
  zoho: "zoho.com",
  ses: "amazonses.com",
  amazonses: "amazonses.com",
};

// Common DKIM selectors to probe when the buyer does not name one.
export const COMMON_DKIM_SELECTORS = ["google", "selector1", "selector2", "default", "s1", "s2", "k1", "dkim", "mail", "zoho", "amazonses"];

export interface Gap {
  severity: "warn" | "info";
  code: string;
  message: string;
  fix?: string;
}

export function providerSpfInclude(provider: string): string {
  return PROVIDER_SPF_INCLUDES[(provider ?? "").trim().toLowerCase()] ?? "";
}

// ── PURE validation (no network) ────────────────────────────────────────

function findSpf(txtRecords: string[]): string {
  for (const rec of txtRecords ?? []) {
    if ((rec ?? "").trim().toLowerCase().startsWith("v=spf1")) return rec.trim();
  }
  return "";
}

export function checkSpf(txtRecords: string[], expectedIncludes: string[] = []): Gap[] {
  const gaps: Gap[] = [];
  const spf = findSpf(txtRecords);
  if (!spf) {
    gaps.push({
      severity: "warn",
      code: "SPF_MISSING",
      message: "no SPF record found on the sending domain — receivers cannot verify your mail is authorized.",
      fix: "Add a TXT record: v=spf1 include:<your-mailbox-provider> ~all",
    });
    return gaps;
  }
  const low = spf.toLowerCase();
  // A bare "v=spf1 ~all"/"-all" with no source mechanism authorizes
  // nothing. `redirect=` is a valid modifier that delegates to another SPF
  // record, so it counts as a source (that record carries the mechanisms).
  const hasMechanism = /(include:|redirect=|ip4:|ip6:|a[:\s]|mx[:\s]|exists:)/.test(low);
  if (!hasMechanism) {
    gaps.push({
      severity: "warn",
      code: "SPF_NO_MECHANISM",
      message: `SPF record has no sending mechanism (include/ip4/a/mx): ${JSON.stringify(spf)}`,
      fix: "Add your provider's include, e.g. include:_spf.google.com",
    });
  }
  for (const inc of expectedIncludes ?? []) {
    if (inc && !low.includes(inc.toLowerCase())) {
      gaps.push({
        severity: "warn",
        code: "SPF_INCLUDE_MISSING",
        message: `SPF record does not include '${inc}' — mail relayed through that provider may fail SPF.`,
        fix: `Add include:${inc} to the existing v=spf1 record (do not add a second SPF record).`,
      });
    }
  }
  if (low.trimEnd().endsWith("+all")) {
    gaps.push({
      severity: "warn",
      code: "SPF_PLUS_ALL",
      message: "SPF ends with +all — this authorizes the whole internet to send as you. Use ~all (soft fail) or -all (hard fail).",
      fix: "Change +all to ~all or -all.",
    });
  }
  return gaps;
}

export function checkDkim(dkimTxt: string): Gap[] {
  const text = (dkimTxt ?? "").trim();
  if (!text) {
    return [
      {
        severity: "warn",
        code: "DKIM_MISSING",
        message: "no DKIM key found at the probed selector(s) — receivers cannot cryptographically verify your mail.",
        fix: "Enable DKIM in your mailbox provider and publish the selector._domainkey TXT record it gives you.",
      },
    ];
  }
  const low = text.toLowerCase();
  if (!low.includes("p=") || /p=\s*(;|$)/.test(low)) {
    return [
      {
        severity: "warn",
        code: "DKIM_NO_KEY",
        message: `DKIM selector responded but carries no public key (p=): ${JSON.stringify(text.slice(0, 80))}`,
        fix: "Re-generate the DKIM key in your provider and republish it.",
      },
    ];
  }
  return [];
}

export function checkDmarc(dmarcTxt: string): Gap[] {
  const text = (dmarcTxt ?? "").trim();
  const fixStarter = "v=DMARC1; p=none; rua=mailto:your-email@your-domain.com";
  if (!text) {
    return [
      {
        severity: "warn",
        code: "DMARC_MISSING",
        message: "no DMARC record found — you are not building DMARC-passing reputation and cannot see aggregate auth reports.",
        fix: `Add a TXT record at _dmarc.<your-domain>: ${fixStarter}`,
      },
    ];
  }
  const low = text.toLowerCase();
  if (!low.startsWith("v=dmarc1")) {
    return [{ severity: "warn", code: "DMARC_MALFORMED", message: `record at _dmarc does not start with v=DMARC1: ${JSON.stringify(text.slice(0, 80))}`, fix: `Replace it with: ${fixStarter}` }];
  }
  const m = low.match(/\bp=\s*(none|quarantine|reject)\b/);
  if (!m) {
    return [{ severity: "warn", code: "DMARC_NO_POLICY", message: `DMARC record has no policy (p=): ${JSON.stringify(text.slice(0, 80))}`, fix: `Set at least p=none: ${fixStarter}` }];
  }
  if (m[1] === "none") {
    return [
      {
        severity: "info",
        code: "DMARC_P_NONE",
        message: "DMARC policy is p=none (monitoring only) — fine to start. Walk it up to p=quarantine then p=reject over weeks while watching your rua aggregate reports.",
      },
    ];
  }
  return [];
}

/** Combine all three checks. Returns a list of Gap ([] == clean). Never
 * throws — this is the pure decision layer. */
export function validateDomain(spfTxts: string[], dkimTxt: string, dmarcTxt: string, expectedIncludes: string[] = []): Gap[] {
  return [...checkSpf(spfTxts, expectedIncludes), ...checkDkim(dkimTxt), ...checkDmarc(dmarcTxt)];
}

// ── LIVE resolution (best-effort; failure degrades to one advisory, never throws) ──

async function resolveTxtFlat(name: string): Promise<string[]> {
  try {
    const records = await resolveTxt(name);
    return records.map((chunks) => chunks.join(""));
  } catch {
    return []; // resolver worked, name simply has no TXT (or NXDOMAIN) — not an error condition
  }
}

/** Best-effort live SPF/DKIM/DMARC check via Node's own DNS resolver — no
 * subprocess fallback chain needed the way the source module's dig/
 * nslookup chain was, since Node ships a real resolver. A total DNS
 * failure (network down, resolver unreachable) degrades to one advisory
 * Gap rather than throwing, same contract the source module's
 * validate_domain_live holds itself to. */
export async function validateDomainLive(domain: string, provider = "", selectors: string[] = COMMON_DKIM_SELECTORS): Promise<Gap[]> {
  const d = (domain ?? "").trim().toLowerCase();
  if (!d) return [{ severity: "warn", code: "DOMAIN_MISSING", message: "no sending domain given to check." }];

  try {
    const spfTxts = await resolveTxtFlat(d);

    let dkimTxt = "";
    for (const selector of selectors) {
      const recs = await resolveTxtFlat(`${selector}._domainkey.${d}`);
      if (recs.length > 0) {
        dkimTxt = recs.join(" ");
        break;
      }
    }

    const dmarcTxts = await resolveTxtFlat(`_dmarc.${d}`);
    const dmarcTxt = dmarcTxts[0] ?? "";

    const include = providerSpfInclude(provider);
    return validateDomain(spfTxts, dkimTxt, dmarcTxt, include ? [include] : []);
  } catch (err) {
    return [
      {
        severity: "warn",
        code: "DNS_RESOLUTION_FAILED",
        message: `could not resolve DNS for ${d}: ${err instanceof Error ? err.message : String(err)} — re-check manually once this resolves.`,
      },
    ];
  }
}
