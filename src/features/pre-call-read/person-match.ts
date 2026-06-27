import { isHighFrequencyCommonName } from "@/lib/utils/name-validator";

export interface DisambiguationPayload {
  email: string;
  name: string;
  companySupplied: string;
  linkedInUrlFromApp?: string;
}

export interface DisambiguationResult {
  totalScore: number;
  passed: boolean;
  trace: Record<string, number | string>;
}

const CONSUMER_DOMAINS = new Set([
  "gmail.com","outlook.com","hotmail.com","yahoo.com",
  "icloud.com","proton.me","aol.com","zoho.com","live.com",
  "me.com","mac.com","ymail.com",
]);

function normalizeCompanyString(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\b(inc|llc|ltd|corp|co|gmbh|limited|group)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Rule 14 identity confidence evaluator.
 * Scores 0–100 across four input signals before any external API is called.
 * Must reach `threshold` (default 99) for research to proceed.
 *
 * Points breakdown:
 *   Input 1 — email domain:  0 | 15 | 30
 *   Input 2 — name:          0 | 15 | 30
 *   Input 3 — LinkedIn URL:  0 | 25
 *   Input 4 — company match: 0 | 15
 *   Total possible: 100
 */
export async function evaluatePersonMatch(
  payload: DisambiguationPayload,
  threshold = 99
): Promise<DisambiguationResult> {
  let score = 0;
  const trace: Record<string, number | string> = {};

  const email = payload.email.toLowerCase().trim();
  const domain = email.split("@")[1] ?? "";
  const cleanName = payload.name.trim();
  const cleanCompany = payload.companySupplied.trim();

  // Input 1: email domain
  let isCorporate = false;
  if (domain && !CONSUMER_DOMAINS.has(domain)) {
    isCorporate = true;
    const normalizedCompany = normalizeCompanyString(cleanCompany);
    const domainRoot = domain.split(".")[0] ?? "";
    const domainMatchesCompany =
      normalizedCompany.length > 0 &&
      (normalizedCompany.includes(domainRoot) || domainRoot.includes(normalizedCompany));
    const pts = domainMatchesCompany ? 30 : 15;
    score += pts;
    trace.input_1_domain = pts;
    trace.input_1_type = domainMatchesCompany ? "verified_corporate" : "unmatched_corporate";
  } else {
    trace.input_1_domain = 0;
    trace.input_1_type = "consumer_domain";
  }

  // Input 2: name
  if (cleanName && cleanName.length > 2) {
    const isCommon = isHighFrequencyCommonName(cleanName);
    const pts = isCommon ? (isCorporate ? 15 : 0) : 30;
    score += pts;
    trace.input_2_name = pts;
    trace.input_2_type = isCommon ? "common_name_guarded" : "distinctive_name";
  } else {
    trace.input_2_name = 0;
    trace.input_2_type = "name_missing_or_short";
  }

  // Input 3: LinkedIn URL
  if (payload.linkedInUrlFromApp?.includes("linkedin.com/in/")) {
    score += 25;
    trace.input_3_linkedin = 25;
  } else {
    trace.input_3_linkedin = 0;
  }

  // Input 4: company cross-signal
  if (isCorporate && cleanCompany && cleanCompany.length > 1) {
    score += 15;
    trace.input_4_company = 15;
  } else {
    trace.input_4_company = 0;
  }

  const totalScore = Math.min(score, 100);
  return {
    totalScore,
    passed: totalScore >= threshold,
    trace: { ...trace, total: totalScore, threshold },
  };
}