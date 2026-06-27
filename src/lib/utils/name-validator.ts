/**
 * Common surname guard for Rule 14 disambiguation.
 *
 * Uses the `common-last-names` npm package (MIT, bundled dataset ~29KB,
 * no network call) which covers the most statistically ambiguous surnames
 * globally. Install: npm install common-last-names
 *
 * Usage in person-match.ts is unchanged — isHighFrequencyCommonName(fullName).
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const lastNames: string[] = require("common-last-names");

// Build a lowercase set for O(1) lookup
const SURNAME_SET = new Set(lastNames.map((n: string) => n.toLowerCase()));

/**
 * Returns true if any token in fullName matches a high-frequency surname.
 * When true, Rule 14 requires cross-signal corroboration before awarding
 * name-match points — prevents briefing the wrong "John Smith".
 */
export function isHighFrequencyCommonName(fullName: string): boolean {
  if (!fullName || fullName.trim().length === 0) return true;
  const tokens = fullName.toLowerCase().trim().split(/\s+/);
  return tokens.some((token) => SURNAME_SET.has(token));
}