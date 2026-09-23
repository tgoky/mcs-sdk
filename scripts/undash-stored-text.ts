// scripts/undash-stored-text.ts
//
// One-time cleanup of em/en dashes in text the app (or its model) already
// wrote to the database before the no-dashes change: run summaries and
// steps, notifications, briefs, reports, generated assets, assistant chat
// replies. New text no longer gets them (static copy was rewritten, and
// llm.ts cleans every model reply), so this only has to run once.
//
// Only columns the app writes itself are touched. Text from outside
// (reviews, mentions, prospect notes, what a user typed, scraped site
// copy) is left exactly as written, and so is rep_audit_events, which is
// an audit trail. HTML (a confirmation page waiting for approval) only
// has the dash character swapped, never re-cased or bracketed, so the page
// stays valid.
//
// Dry-run by default, same convention as the other scripts here. The dry
// run writes every change (before and after, with context) to
// undash-preview.txt so it can be read in full before applying.
//
// Usage:
//   npx tsx scripts/undash-stored-text.ts
//   npx tsx scripts/undash-stored-text.ts --yes
//
// Requires DIRECT_URL (or DATABASE_URL as a fallback) in .env.

import * as dotenv from "dotenv";
dotenv.config({ path: ".env" });

import { writeFileSync } from "node:fs";
import postgres from "postgres";
import { undash, undashDeep } from "../src/lib/plain-punctuation";

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Error: neither DIRECT_URL nor DATABASE_URL is set in your .env file.");
  process.exit(1);
}

const CONFIRM = process.argv.includes("--yes");

interface Target {
  table: string;
  column: string;
  kind: "text" | "jsonb";
  /** Extra SQL condition, e.g. only the assistant's own chat messages. */
  where?: string;
}

const TARGETS: Target[] = [
  { table: "skill_runs", column: "steps", kind: "jsonb" },
  { table: "skill_runs", column: "summary", kind: "jsonb" },
  { table: "skill_runs", column: "error_message", kind: "text" },
  { table: "notifications", column: "title", kind: "text" },
  { table: "notifications", column: "body", kind: "text" },
  { table: "human_blockers", column: "description", kind: "text" },
  { table: "pending_actions", column: "payload", kind: "jsonb" },
  { table: "account_reviews", column: "review_text", kind: "text" },
  { table: "skill_compare_runs", column: "narrative", kind: "text" },
  { table: "skill_run_analyses", column: "narrative", kind: "text" },
  { table: "audit_runs_log", column: "top_issues", kind: "jsonb" },
  { table: "audit_runs_log", column: "gaps", kind: "jsonb" },
  { table: "audit_runs_log", column: "report_markdown", kind: "text" },
  { table: "rep_incidents", column: "summary", kind: "text" },
  { table: "rep_incidents", column: "evidence_package", kind: "text" },
  { table: "conversation_intelligence_sessions", column: "extracted_objections", kind: "jsonb" },
  { table: "conversation_intelligence_sessions", column: "extraction_summary", kind: "text" },
  { table: "client_report_notes", column: "notes_text", kind: "text" },
  { table: "briefed_calls_log", column: "brief_text", kind: "text" },
  { table: "chat_messages", column: "display_text", kind: "text", where: "role = 'assistant'" },
  // Generated per-client assets.
  ...[
    "brand_voice_profile",
    "ad_creative_briefs",
    "pin_down_script_pack",
    "pin_down_page_audit",
    "discovery_prefill",
    "pile_on_sequence_asset_map",
    "pile_on_sms_asset_map",
    "pile_on_existing_sequence_audit",
    "win_back_sequence_asset_map",
    "long_term_nurture_asset_map",
    "existing_audit_audit_result",
  ].map((column): Target => ({ table: "engagements", column, kind: "jsonb" })),
];

const sql = postgres(connectionString, { max: 1, prepare: false });

const PREVIEW_FILE = "undash-preview.txt";

/** Every string inside a value, paired with what undash makes of it. */
function changedStrings(value: unknown, out: [string, string][] = []): [string, string][] {
  if (typeof value === "string") {
    const after = undash(value);
    if (after !== value) {
      // Show changed lines only, so a long brief doesn't flood the preview.
      const b = value.split("\n");
      const a = after.split("\n");
      if (a.length === b.length) b.forEach((line, i) => line !== a[i] && out.push([line, a[i]]));
      else out.push([value, after]);
    }
  } else if (Array.isArray(value)) value.forEach((v) => changedStrings(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => changedStrings(v, out));
  return out;
}

const clip = (s: string) => (s.length > 300 ? `${s.slice(0, 300)}…` : s);

async function main() {
  let total = 0;
  const preview: string[] = [];
  try {
    for (const t of TARGETS) {
      const col = sql(t.column);
      const table = sql(t.table);
      const hasDash = t.kind === "jsonb" ? sql`${col}::text ~ '[—–]'` : sql`${col} ~ '[—–]'`;
      const extra = t.where ? sql.unsafe(`AND ${t.where}`) : sql``;
      const rows = await sql<{ id: string; value: unknown }[]>`SELECT id, ${col} AS value FROM ${table} WHERE ${hasDash} ${extra}`;
      if (rows.length === 0) continue;
      total += rows.length;
      console.log(`${t.table}.${t.column}: ${rows.length} row(s)`);
      for (const [i, row] of rows.entries()) {
        const lines = changedStrings(t.kind === "jsonb" ? row.value : String(row.value)).map(
          ([before, after]) => `    ${clip(before)}\n    -> ${clip(after)}`
        );
        if (i === 0) console.log(lines.slice(0, 2).join("\n"));
        preview.push(`${t.table}.${t.column} id=${row.id}`, ...lines, "");
      }
      if (!CONFIRM) continue;
      for (const row of rows) {
        if (t.kind === "jsonb") {
          await sql`UPDATE ${table} SET ${col} = ${sql.json(undashDeep(row.value) as postgres.JSONValue)} WHERE id = ${row.id}`;
        } else {
          await sql`UPDATE ${table} SET ${col} = ${undash(String(row.value))} WHERE id = ${row.id}`;
        }
      }
    }
    if (total > 0) writeFileSync(PREVIEW_FILE, preview.join("\n"));
    if (total === 0) console.log("No stored text with dashes found. Nothing to do.");
    else if (!CONFIRM) console.log(`\nDry run: ${total} row(s) would change. Every change is listed in ${PREVIEW_FILE}. Re-run with --yes to apply.`);
    else console.log(`\nUpdated ${total} row(s).`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
