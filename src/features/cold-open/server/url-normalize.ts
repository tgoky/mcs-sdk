// src/features/cold-open/server/url-normalize.ts
//
// Domain-cleaning helper shared by every lead fetcher's normalize step.
// Port of fetchers/base.py's normalize_domain (Cold Open skill pack).

/** Clean a domain from whatever the source returned (URL, email, host). */
export function normalizeDomain(value: string | null | undefined): string {
  if (!value) return "";
  let s = String(value).trim();
  s = s.replace(/^https?:\/\//i, "");
  s = s.replace(/^www\./i, "");
  s = s.split("/")[0].split("?")[0].split("#")[0];
  if (s.includes("@")) s = s.split("@").pop()!;
  return s.toLowerCase().trim();
}
