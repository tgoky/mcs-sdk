// src/lib/plain-punctuation.ts
//
// No em or en dashes in text the app writes. Static copy is written
// without them; this covers the text the model writes (briefs, emails,
// chat replies, reports), which would otherwise keep producing them.
// llm.ts adds NO_DASHES_RULE to every system prompt and runs undash() over
// what comes back, as a backstop for when the model ignores the rule.
// scripts/undash-stored-text.ts uses the same functions on text saved
// before the rule existed.
//
// Not applied to callOpenRouterModel: rep-engine-panel records what other
// AI engines say about a client, and that has to be stored as they said it.

export const NO_DASHES_RULE =
  "Writing style: never use em dashes (—) or en dashes (–). Use a comma, colon, period or parentheses instead, and a plain hyphen for ranges (3-5).";

const DASH = /[—–]/;
// A tail starting with one of these continues the sentence ("fast, not cheap").
const CONTINUES = /^(not|and|but|or|nor|so|yet|which|while|rather|just|only|plus|then|including|especially|like|with|without|because|since|though|although|if|unless|as|such as|for example|for instance|e\uE000g\uE000|i\uE000e\uE000)(?=[\s,.:]|$)/i;
// An aside that starts like this is an example list, not a pause: "A — e.g. x, y — B".
const EXAMPLE_ASIDE = /^(e\uE000g\uE000|i\uE000e\uE000|such as|for example|for instance|like)(?=[\s,]|$)/i;

// Abbreviations whose dot doesn't end a sentence. Their dots are swapped
// for a private character while a line is worked on, then put back.
const ABBREVIATIONS = /\b(e\.g|i\.e|etc|vs|approx|incl|min|max|Mr|Mrs|Ms|Dr|St|Inc|Ltd|Co|No)\./gi;
const HIDDEN_DOT = "\uE000";

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/** Capitalizes a plain lowercase word; leaves code, names, numbers, quotes alone. */
function capitalize(s: string): string {
  const m = s.match(/^(\s*)(\S+)/);
  if (!m || !/^[a-z][a-z'’-]*[,;:.!?)]?$/.test(m[2])) return s;
  return m[1] + m[2][0].toUpperCase() + s.slice(m[1].length + 1);
}

/** Splits a tail into its body and the sentence end that follows it. */
function splitEnd(tail: string): { body: string; end: string } {
  const m = tail.match(/^([\s\S]*?)([.!?]+["'”’)]*\s*|\s*)$/);
  return m ? { body: m[1], end: m[2] } : { body: tail, end: "" };
}

/** One dash between `left` (the sentence so far) and `right` (the rest of it). */
function joinAt(left: string, right: string): string {
  const leftWords = words(left.replace(/^[\s\S]*[.!?:;(]\s+/, ""));
  const { body, end } = splitEnd(right);
  const tailWords = words(body);
  if (CONTINUES.test(right.trim())) return `${left}, ${right}`;
  // "If it comes up next month — the offer's open": a comma closes an opening condition.
  if (/^\s*(if|when|whenever|once|after|before|until|although|though|because|since|while|unless)\b/i.test(left.replace(/^[\s\S]*[.!?]\s+/, ""))) return `${left}, ${right}`;
  // "Hi {{first_name}} — quick question" is a greeting, not a label.
  if (/^\s*(hi|hey|hello|thanks|thank you)\b/i.test(left)) return `${left}, ${right}`;
  if (leftWords > 0 && leftWords <= 2) return `${left}: ${right}`;
  // A question keeps its question mark: "What can I help with? Want to run it?"
  if (tailWords >= 3) return `${left}${end.trim().startsWith("?") ? "?" : "."} ${capitalize(right)}`;
  if (tailWords > 0) return `${left} (${body.trim()})${end}`;
  return `${left}${right}`;
}

function undashLine(line: string): string {
  return undashAbbreviated(line.replace(ABBREVIATIONS, (m) => m.replace(/\./g, HIDDEN_DOT))).replace(/\uE000/g, ".");
}

function undashAbbreviated(line: string): string {
  const s = line
    // 3–5, 2024–2025, $10–$20
    .replace(/(\d)\s*[—–]\s*(?=[$€£]?\d)/g, "$1-")
    // "— item" at the start of a line
    .replace(/^([ \t]*)[—–][ \t]+/, "$1- ")
    // after a closing quote it introduces what follows: "…take?": text
    .replace(/([.!?]["'”’])[ \t]*[—–]+[ \t]*/g, "$1: ")
    // right after other punctuation the dash just goes
    .replace(/([:;.!?,]["'”’)]?)[ \t]*[—–]+[ \t]*/g, "$1 ")
    // a dash left at the end of the line
    .replace(/[ \t]*[—–]+[ \t]*$/, "");
  if (!DASH.test(s)) return s;

  // Work sentence by sentence so a dash only looks at its own sentence.
  return s
    // A sentence ends at . ! ? followed by a space or the end, so the dot in
    // {{contact.first_name}}, a URL or a file name doesn't split one.
    .match(/(?:[^.!?]|[.!?](?![.!?]*["'”’)]*(?:\s|$)))+(?:[.!?]+["'”’)]*\s*|$)|[.!?]+["'”’)]*\s*/g)!
    .map((sentence) => {
      const parts = sentence.split(/[ \t]*[—–]+[ \t]*/);
      if (parts.length === 1) return sentence;
      if (parts.length === 3 && words(parts[1]) > 0) {
        // An aside: "A — b — C"
        const aside = parts[1].trim();
        if (EXAMPLE_ASIDE.test(aside)) {
          // "Include proof — e.g. x, y — avoid vague claims": the examples go in
          // brackets and what follows the second dash is its own clause.
          const rest = parts[2];
          const { body } = splitEnd(rest);
          return words(body) >= 3 ? `${parts[0]} (${aside}). ${capitalize(rest)}` : `${parts[0]} (${aside}) ${rest}`;
        }
        return aside.includes(",") ? `${parts[0]} (${aside}) ${parts[2]}` : `${parts[0]}, ${aside}, ${parts[2]}`;
      }
      return parts.reduce((acc, next) => joinAt(acc, next));
    })
    .join("");
}

/** Replaces em and en dashes with the punctuation a person would have
 * used: a colon after a short label, a new sentence before a full clause,
 * parentheses around a short tail, commas around an aside, hyphens for
 * ranges and for a dash that starts a list line. */
export function undash(text: string): string {
  if (!DASH.test(text)) return text;
  if (looksLikeMarkup(text)) return undashMarkup(text);
  return text.split("\n").map(undashLine).join("\n").replace(/,\s*,/g, ",");
}

function looksLikeMarkup(text: string): boolean {
  return /<(!doctype|html|head|body|style|script|div|p|span)\b/i.test(text);
}

/** For HTML/CSS/JS: never changes letter case or adds brackets, only
 * swaps the dash itself, so code stays valid. */
export function undashMarkup(text: string): string {
  return text
    .replace(/(\d)\s*[—–]\s*(?=[$€£]?\d)/g, "$1-")
    .replace(/[ \t]+[—–]+[ \t]+/g, ", ")
    .replace(/[—–]/g, "-");
}

/** undash() over every string in a value (tool inputs, saved JSON). */
export function undashDeep<T>(value: T): T {
  if (typeof value === "string") return undash(value) as T;
  if (Array.isArray(value)) return value.map(undashDeep) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, undashDeep(v)])) as T;
  }
  return value;
}
