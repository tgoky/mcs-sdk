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
// an audit trail. Pasted-ready confirmation-page HTML isn't edited here:
// rebuild the page instead to pick up the new template.
//
// Dry-run by default, same convention as the other scripts here.
//
// Usage:
//   npx tsx scripts/undash-stored-text.ts
//   npx tsx scripts/undash-stored-text.ts --yes
//
// Requires DIRECT_URL (or DATABASE_URL as a fallback) in .env.

import * as dotenv from "dotenv";
dotenv.config({ path: ".env" });

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

async function main() {
  let total = 0;
  try {
    for (const t of TARGETS) {
      const col = sql(t.column);
      const table = sql(t.table);
      const hasDash = t.kind === "jsonb" ? sql`${col}::text ~ '[—–]'` : sql`${col} ~ '[—–]'`;
      const extra = t.where ? sql.unsafe(`AND ${t.where}`) : sql``;
      const rows = await sql<{ id: string; value: unknown }[]>`SELECT id, ${col} AS value FROM ${table} WHERE ${hasDash} ${extra}`;
      if (rows.length === 0) continue;
      total += rows.length;
      const sample = rows[0];
      const before = t.kind === "jsonb" ? JSON.stringify(sample.value) : String(sample.value);
      const after = t.kind === "jsonb" ? JSON.stringify(undashDeep(sample.value)) : undash(String(sample.value));
      console.log(`${t.table}.${t.column}: ${rows.length} row(s)`);
      console.log(`  e.g. ${before.slice(0, 140)}`);
      console.log(`    -> ${after.slice(0, 140)}`);
      if (!CONFIRM) continue;
      for (const row of rows) {
        if (t.kind === "jsonb") {
          await sql`UPDATE ${table} SET ${col} = ${sql.json(undashDeep(row.value) as postgres.JSONValue)} WHERE id = ${row.id}`;
        } else {
          await sql`UPDATE ${table} SET ${col} = ${undash(String(row.value))} WHERE id = ${row.id}`;
        }
      }
    }
    if (total === 0) console.log("No stored text with dashes found. Nothing to do.");
    else if (!CONFIRM) console.log(`\nDry run: ${total} row(s) would change. Re-run with --yes to apply.`);
    else console.log(`\nUpdated ${total} row(s).`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
