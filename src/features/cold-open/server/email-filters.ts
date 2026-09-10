// src/features/cold-open/server/email-filters.ts
//
// Admin-email deny-list + generic-name inference, applied identically by
// every lead fetcher's shared normalize step (fetchers/base.ts). Port of
// the Cold Open skill pack's email_filters.py.
//
// V1 scope note: this ports layers 1-3 of the source module's
// screen_lead_email (deterministic admin gate, kept-name passthrough,
// separator-delimited local-part parse) faithfully. Layer 4 — a Haiku
// classifier for a bare fused local-part with no separator (sally@,
// bsmith@) that decides role-vs-person and infers a name — is NOT ported
// here; a bare local-part with no separator falls straight to the
// fallback ("no name -> Hi there,"), same as the source module's own
// behavior when its classifier is disabled. Flagged unbuilt rather than
// silently claimed, same convention this app already applies elsewhere
// (see pre-call-read's personMatchConfidenceThreshold in worker-registry.ts).

// Matched as an exact whole-local-part OR as a separator-delimited token
// (split on . _ -). Safe against real names because the boundaries are real.
const ADMIN_LOCALPARTS = new Set([
  "info", "contact", "hello", "hi", "admin", "mail", "support", "sales", "help",
  "noreply", "no-reply", "enquiries", "inquiries", "office", "team",
  "marketing", "press", "pr", "media", "legal", "billing", "careers", "jobs",
  "hr", "webmaster", "postmaster", "abuse",
]);

// Matched as a substring ANYWHERE in the local-part. Restricted to the
// subset that is essentially impossible inside a real first name, so
// "velocityinfo" drops while "mailton" / "hilton" / "jacobs" do NOT. The
// riskier deny words (mail, sales, team, office, ...) are only matched on
// a token boundary via ADMIN_LOCALPARTS, never as a substring.
const ADMIN_SUBSTRINGS = ["info", "noreply", "no-reply", "webmaster", "postmaster", "admin", "abuse", "enquiries", "inquiries"];

const SEPARATOR_RE = /[._-]/;

const GENERIC_FIRST_NAME_PLACEHOLDERS = new Set(["owner", "founder", "admin", "ceo", "manager", "team", "contact", "staff", "office", "principal", "president", "director"]);

function localPart(email: string): string {
  if (!email || !email.includes("@")) return "";
  let local = email.split("@")[0].trim().toLowerCase();
  local = local.split("+")[0]; // strip plus-addressing (info+outreach@x.com is still info@)
  return local;
}

function localPartIsAdmin(local: string): boolean {
  if (!local) return false;
  if (ADMIN_LOCALPARTS.has(local)) return true;
  const tokens = local.split(SEPARATOR_RE).filter(Boolean);
  if (tokens.some((t) => ADMIN_LOCALPARTS.has(t))) return true;
  if (ADMIN_SUBSTRINGS.some((sub) => local.includes(sub))) return true;
  return false;
}

/** True if the email's local-part is a role/admin address. Domain-
 * independent by design — info@johnsmithlaw.com and
 * Velocityinfo@velocitywealthmgt.com both drop. */
export function isAdminEmail(email: string): boolean {
  return localPartIsAdmin(localPart(email));
}

export function isGenericFirstName(name: string): boolean {
  const n = (name ?? "").trim().toLowerCase();
  return !n || GENERIC_FIRST_NAME_PLACEHOLDERS.has(n);
}

/** Deterministic-only inference: a Title-cased first name from an email
 * local-part when it has an explicit separator (brian.smith@ ->
 * Brian). Returns "" for a bare fused local-part with no separator
 * (bsmith@, brianbrown@) — see this file's header for why those aren't
 * guessed at here. */
export function inferFirstNameFromEmail(email: string): string {
  const local = localPart(email);
  if (!local) return "";
  const parts = local.split(SEPARATOR_RE).filter(Boolean);
  if (parts.length < 2) return "";
  const first = parts[0];
  if (first.length < 2 || !/^[a-z]+$/i.test(first)) return "";
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

export interface LeadEmailScreen {
  drop: boolean;
  dropReason: string;
  firstName: string;
  inferred: boolean;
  method: "deterministic-admin" | "kept-name" | "separator" | "fallback";
}

/** Single combined entry point for the fetchers: decide in one shot
 * whether a lead should be dropped (role account) and what first name to
 * use. Layering (cheapest first): (1) deterministic admin gate, (2) keep
 * an already-present real first name, (3) deterministic separator parse,
 * (4) fallback -> no name, kept, "Hi there,". */
export function screenLeadEmail(email: string, currentFirstName = ""): LeadEmailScreen {
  const local = localPart(email);

  if (local && localPartIsAdmin(local)) {
    return { drop: true, dropReason: `admin-style email address: ${email}`, firstName: "", inferred: false, method: "deterministic-admin" };
  }

  if (!isGenericFirstName(currentFirstName)) {
    return { drop: false, dropReason: "", firstName: currentFirstName.trim(), inferred: false, method: "kept-name" };
  }

  const sep = inferFirstNameFromEmail(email);
  if (sep) {
    return { drop: false, dropReason: "", firstName: sep, inferred: true, method: "separator" };
  }

  return { drop: false, dropReason: "", firstName: "", inferred: false, method: "fallback" };
}
