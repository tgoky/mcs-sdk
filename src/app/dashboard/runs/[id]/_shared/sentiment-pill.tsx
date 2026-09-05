import { StatusPill } from "./status-pill";

/** Shared by Reputation Manager's 3 ingestion detail views (engine panel,
 * Trustpilot, Reddit) — same sentiment/flagged vocabulary on every one. */
export function SentimentPill({ sentiment }: { sentiment: string }) {
  const tone = sentiment === "negative" ? "danger" : sentiment === "positive" ? "success" : "neutral";
  return <StatusPill tone={tone}>{sentiment}</StatusPill>;
}

export function FlaggedPill({ flagged, reason }: { flagged: boolean; reason?: string | null }) {
  if (!flagged) return null;
  return (
    <span title={reason ?? undefined} className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md bg-rose-100 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20">
      flagged
    </span>
  );
}
