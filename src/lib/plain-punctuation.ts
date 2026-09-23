// src/lib/plain-punctuation.ts
//
// No em or en dashes in text the app writes. Static copy is written
// without them; this covers the text the model writes (briefs, emails,
// chat replies, reports), which would otherwise keep producing them.
// llm.ts adds NO_DASHES_RULE to every system prompt and runs undash() over
// what comes back, as a backstop for when the model ignores the rule.
//
// Not applied to callOpenRouterModel: rep-engine-panel records what other
// AI engines say about a client, and that has to be stored as they said it.

export const NO_DASHES_RULE =
  "Writing style: never use em dashes (—) or en dashes (–). Use a comma, colon, period or parentheses instead, and a plain hyphen for ranges (3-5).";

/** Replaces em and en dashes with the punctuation a person would have
 * used. Ranges become hyphens, a dash between words becomes a comma, and
 * a dash that starts a list line becomes a hyphen bullet. */
export function undash(text: string): string {
  if (!/[—–]/.test(text)) return text;
  return (
    text
      // 3–5, 2024–2025, $10—$20
      .replace(/(\d)\s*[—–]\s*(?=[$€£]?\d)/g, "$1-")
      // "— item" at the start of a line
      .replace(/^([ \t]*)[—–][ \t]+/gm, "$1- ")
      // "word — word", "word—word" (after a colon or period the dash just goes)
      .replace(/([:;.!?,])[ \t]*[—–]+[ \t]*/g, "$1 ")
      .replace(/[ \t]*[—–]+[ \t]*(?=\S)/g, ", ")
      // a dash left at the end of a line
      .replace(/[ \t]*[—–]+[ \t]*$/gm, "")
      .replace(/,\s*,/g, ",")
  );
}

/** undash() over every string in a tool call's input. */
export function undashDeep<T>(value: T): T {
  if (typeof value === "string") return undash(value) as T;
  if (Array.isArray(value)) return value.map(undashDeep) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, undashDeep(v)])) as T;
  }
  return value;
}
