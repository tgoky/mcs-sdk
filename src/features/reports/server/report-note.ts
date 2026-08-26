import { db } from "@/lib/db";
import { clientReportNotes, engagements } from "@/models/schema";
import { and, eq, desc } from "drizzle-orm";
import { callClaudeWithRetry, MODEL } from "@/lib/llm";
import type { ClientReportMetrics, ReportPeriod } from "./report-service";

const CACHEABLE: Exclude<ReportPeriod, "all_time">[] = ["week", "month"];

function isCacheablePeriod(period: ReportPeriod): period is "week" | "month" {
  return (CACHEABLE as ReportPeriod[]).includes(period);
}

/** Nothing happened — don't spend a model call saying so in six different ways. */
function isMetricsEmpty(m: ClientReportMetrics): boolean {
  return (
    m.bookings === 0 &&
    m.calls.total === 0 &&
    m.winBack.rebooked + m.winBack.lost + m.winBack.replyExited + m.winBack.active + m.winBack.corrected === 0 &&
    m.approvals.approved === 0 &&
    m.approvals.rejected === 0
  );
}

function metricsLine(m: ClientReportMetrics): string {
  return [
    `Bookings: ${m.bookings}`,
    `Calls resolved: ${m.calls.total} (showed ${m.calls.showed}, no-show ${m.calls.noShow}, rescheduled ${m.calls.rescheduled}${m.calls.showRate !== null ? `, show rate ${(m.calls.showRate * 100).toFixed(0)}%` : ""})`,
    `Win-Back: ${m.winBack.rebooked} rebooked, ${m.winBack.lost} lost, ${m.winBack.replyExited} replied, ${m.winBack.active} still active${m.winBack.recoveryRate !== null ? `, recovery rate ${(m.winBack.recoveryRate * 100).toFixed(0)}%` : ""}`,
    `Approvals: ${m.approvals.approved} approved, ${m.approvals.rejected} rejected`,
  ].join("\n");
}

/**
 * Returns the cached note for this exact period if one already exists —
 * report pages get viewed repeatedly, and re-calling the model on every
 * page load would be both slow and, per direct feedback, more likely to
 * drift into the exact generic-restatement problem this is trying to
 * avoid (a fresh call each time has no memory of how it phrased things
 * five minutes ago).
 */
export async function getCachedReportNote(
  engagementId: string,
  period: ReportPeriod,
  periodKey: string | null
): Promise<{ notesText: string; generatedAt: Date } | null> {
  if (!isCacheablePeriod(period) || !periodKey) return null;
  const [row] = await db
    .select({ notesText: clientReportNotes.notesText, generatedAt: clientReportNotes.generatedAt })
    .from(clientReportNotes)
    .where(
      and(
        eq(clientReportNotes.engagementId, engagementId),
        eq(clientReportNotes.period, period),
        eq(clientReportNotes.periodKey, periodKey)
      )
    )
    .limit(1);
  return row ?? null;
}

/**
 * Generates (and caches) the qualitative note for one period, grounded
 * strictly in the real computed numbers — never invented content. The
 * direct complaint this is built against: "makes no sense for users to
 * keep seeing the same sentences over and over." Two things do the actual
 * work here, not just prompt-level pleading:
 *   1. Nothing gets generated at all when isMetricsEmpty() — a quiet
 *      period doesn't need six different ways of saying "nothing happened."
 *   2. The last two cached notes for this same engagement+period type are
 *      fetched and included as "already said, don't repeat" context, so
 *      week 6's note can't reuse week 5's opening line even if the
 *      underlying numbers happen to look similar.
 * Caches the result under (engagementId, period, periodKey) so the same
 * period is never regenerated once written — see getCachedReportNote.
 */
export async function generateReportNote(
  engagementId: string,
  period: ReportPeriod,
  metrics: ClientReportMetrics
): Promise<string | null> {
  if (!isCacheablePeriod(period)) return null;
  if (isMetricsEmpty(metrics)) return null;

  if (isCacheablePeriod(period) && metrics.periodKey) {
    const cached = await getCachedReportNote(engagementId, period, metrics.periodKey);
    if (cached) return cached.notesText;
  }

  const [tenant] = await db
    .select({ buyer: engagements.buyer })
    .from(engagements)
    .where(eq(engagements.engagementId, engagementId))
    .limit(1);
  if (!tenant) return null;

  let priorNotesBlock = "";
  if (isCacheablePeriod(period)) {
    const priorRows = await db
      .select({ periodKey: clientReportNotes.periodKey, notesText: clientReportNotes.notesText })
      .from(clientReportNotes)
      .where(and(eq(clientReportNotes.engagementId, engagementId), eq(clientReportNotes.period, period)))
      .orderBy(desc(clientReportNotes.periodKey))
      .limit(2);
    if (priorRows.length > 0) {
      priorNotesBlock = `\n\nNotes from the last ${priorRows.length} period(s), for reference only — do not reuse their opening words, sentence structure, or phrasing:\n${priorRows.map((r) => `[${r.periodKey}] ${r.notesText}`).join("\n")}`;
    }
  }

  const system = `You write short internal performance notes for a B2B sales-automation dashboard. The reader is the operator running this client's account — a professional who will read many of these over time and finds generic AI-sounding summaries actively annoying.

Rules:
- 1-2 sentences. No more.
- Reference only the specific numbers given. Never invent a cause, trend, or explanation the numbers don't support.
- Do not restate every number — the raw metrics are already shown separately above this note. Only call out what's actually worth a human noticing: a real problem, a real win, or a real change worth watching.
- No boilerplate openers ("Overall,", "This week,", "In summary,"). No filler adjectives ("great", "solid", "strong performance"). No hedging ("it seems", "it appears").
- If nothing here rises above routine, say the specific number that's routine in one short clause instead of padding — don't manufacture significance.
- Vary sentence structure and word choice from the prior notes shown below, if any. Two periods with similar numbers should not produce similar-sounding notes.
- Output only the note text. No preamble, no quotation marks, no markdown.`;

  const userMessage = `Client: ${tenant.buyer}\nPeriod: ${metrics.periodLabel}\n\n${metricsLine(metrics)}${priorNotesBlock}`;

  let noteText: string;
  try {
    const result = await callClaudeWithRetry({
      model: MODEL.FAST,
      system,
      userMessage,
      maxTokens: 200,
    });
    noteText = result.text.trim();
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[report-notes] Generation failed for ${engagementId}/${period}:`, message);
    return null;
  }

  if (!noteText) return null;

  if (isCacheablePeriod(period) && metrics.periodKey) {
    try {
      await db
        .insert(clientReportNotes)
        .values({
          engagementId,
          period,
          periodKey: metrics.periodKey,
          notesText: noteText,
          metricsSnapshot: metrics,
        })
        .onConflictDoNothing();
    } catch (e: unknown) {
      // Note still renders this once even if the cache write fails —
      // just means next view regenerates instead of reading from cache.
      const message = e instanceof Error ? e.message : String(e);
      console.error(`[report-notes] Cache write failed for ${engagementId}/${period}:`, message);
    }
  }

  return noteText;
}
