// src/features/cold-open/server/subject-variants.ts
//
// Rotating, customer-generated cold-email subject pools. Direct port of
// the Cold Open skill pack's subject_variants.py — same rules, same
// reasoning: a pool authored by Voice Capture (from the buyer's own brand
// voice) or entered directly, validated at capture time and rotated
// deterministically at send time via hash-rotation.ts's pickByHash.
//
// Two responsibilities, same split as the source module:
//   1. Rotation (runtime, Daily Send / copy-engine): subjectFor()
//   2. Validation (capture time, Voice Capture): validateSubjectPool()

import { pickByHash } from "./hash-rotation";

// Instantly's guidance: 3-4 subject variants is the working baseline, A/Z
// (26) is the platform maximum.
export const MIN_POOL_SIZE = 3;
export const MAX_POOL_SIZE = 26;

// 25-45 is the target; 55 is the hard cap renderSubject enforces (mobile
// clients truncate well before that).
export const MAX_SUBJECT_LENGTH = 55;
const COMPANY_CAP = 25;

const COMPANY_TOKEN = "{company_name}";
// First-name-in-subject is a modern automated-outreach tell; both the
// single- and double-brace conventions are rejected.
const FIRST_NAME_TOKENS = ["{first_name}", "{{first_name}}"];
const FAKE_THREAD_PREFIXES = ["re:", "fwd:", "fw:"];
const EM_DASH = "—";
const EN_DASH = "–";
// All merge tokens stripped before the casing/emoji checks so a
// legitimately capitalized {company_name} token never trips the
// lowercase warning.
const TOKEN_RE = /\{+[a-z_]+\}+/g;
const EMOJI_RE =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F02F}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}]/u;

export type SubjectPoolViolationSeverity = "error" | "warn";

export interface SubjectPoolViolation {
  severity: SubjectPoolViolationSeverity;
  /** 0-based variant index, or null for a pool-level problem (size). */
  index: number | null;
  rule: string;
  message: string;
}

function fixedText(template: string): string {
  return (template ?? "").replace(TOKEN_RE, "");
}

/** Validate a customer subject pool. Returns a list of violations (empty
 * == clean). Hard rules (severity "error"): em/en dashes, exclamation,
 * emoji, fake Re:/Fwd: prefix, first-name token, literal text over the
 * 55-char cap, pool size over 26. Soft rules ("warn"): title-case text,
 * pool size under 3. */
export function validateSubjectPool(variants: string[]): SubjectPoolViolation[] {
  const out: SubjectPoolViolation[] = [];
  variants = variants ?? [];

  if (variants.length > MAX_POOL_SIZE) {
    out.push({
      severity: "error",
      index: null,
      rule: "pool_too_large",
      message: `${variants.length} variants — the max is ${MAX_POOL_SIZE} (Instantly A/Z). Trim the pool.`,
    });
  }
  if (variants.length < MIN_POOL_SIZE) {
    out.push({
      severity: "warn",
      index: null,
      rule: "pool_too_small",
      message: `only ${variants.length} variant(s) — Instantly's baseline is ${MIN_POOL_SIZE}-4. Add more so the rotation actually varies.`,
    });
  }

  variants.forEach((raw, i) => {
    const template = typeof raw === "string" ? raw : String(raw ?? "");
    if (!template.trim()) {
      out.push({ severity: "error", index: i, rule: "empty", message: "variant is empty." });
      return;
    }

    for (const token of FIRST_NAME_TOKENS) {
      if (template.includes(token)) {
        out.push({
          severity: "error",
          index: i,
          rule: "first_name_token",
          message: `contains '${token}' — first name in the subject line is a cold-email automation tell. Personalize the body, not the subject.`,
        });
        break;
      }
    }
    if (template.includes(EM_DASH) || template.includes(EN_DASH)) {
      out.push({
        severity: "error",
        index: i,
        rule: "em_dash",
        message: "contains an em/en dash — a strong AI tell. Use a comma, colon, or two shorter phrases.",
      });
    }
    if (template.includes("!")) {
      out.push({ severity: "error", index: i, rule: "exclamation", message: "contains an exclamation point — reads as promotional. Remove it." });
    }
    if (EMOJI_RE.test(template)) {
      out.push({ severity: "error", index: i, rule: "emoji", message: "contains an emoji/pictograph — a promotions-tab signal. Remove it." });
    }
    const low = template.trimStart().toLowerCase();
    for (const pref of FAKE_THREAD_PREFIXES) {
      if (low.startsWith(pref)) {
        out.push({
          severity: "error",
          index: i,
          rule: "fake_thread_prefix",
          message: `starts with a fake '${pref}' prefix — banned by Google/Yahoo/Microsoft bulk-sender rules. Drop it.`,
        });
        break;
      }
    }

    const fixed = fixedText(template);
    if (fixed.length > MAX_SUBJECT_LENGTH) {
      out.push({
        severity: "error",
        index: i,
        rule: "too_long",
        message: `literal text is ${fixed.length} chars, over the ${MAX_SUBJECT_LENGTH}-char cap even before ${COMPANY_TOKEN} — no company name can shorten it. Tighten the wording (target 25-45 chars).`,
      });
    }

    const strippedTokens = template.replace(TOKEN_RE, "");
    if (strippedTokens !== strippedTokens.toLowerCase()) {
      out.push({
        severity: "warn",
        index: i,
        rule: "not_lowercase",
        message: "has upper-case letters — lowercase subjects read as personal, not blasted. Consider lowercasing (the runtime never forces it).",
      });
    }
  });

  return out;
}

export function poolHasErrors(violations: SubjectPoolViolation[]): boolean {
  return violations.some((v) => v.severity === "error");
}

/** Deterministically select one variant template from the pool for this
 * lead (same lead_email -> same variant forever; consecutive leads
 * spread). */
export function pickSubjectVariant(leadEmail: string, variants: string[]): string {
  return pickByHash(leadEmail, variants ?? []);
}

/** Substitute {company_name} and length-guard the result. If the rendered
 * subject exceeds max_length, truncate the {company_name} portion
 * (subject context ONLY). A template with no {company_name} token passes
 * through unchanged. */
export function renderSubject(template: string, companyName: string, maxLength: number = MAX_SUBJECT_LENGTH): string {
  const company = (companyName ?? "").trim();
  const subject = (template ?? "").split(COMPANY_TOKEN).join(company);
  if (subject.length <= maxLength) return subject;
  const truncated = company.slice(0, COMPANY_CAP).trimEnd() + "...";
  return (template ?? "").split(COMPANY_TOKEN).join(truncated);
}

/** Full runtime pipeline: pick this lead's variant from the pool, render
 * it with the length guard. Returns "" when the pool is empty (the caller
 * falls back to its generated/template subject). */
export function subjectFor(variants: string[], leadEmail: string, companyName: string): string {
  if (!variants || variants.length === 0) return "";
  return renderSubject(pickSubjectVariant(leadEmail, variants), companyName);
}
