import { Radio, CheckCircle2, XCircle, Loader2, Clock, ShieldAlert } from "lucide-react";
import { callSessionStatusLabel, callSessionStatusColor } from "@/lib/copy";
import type { conversationIntelligenceSessions } from "@/models/schema";

type ConversationIntelligenceSessionRow = typeof conversationIntelligenceSessions.$inferSelect;

function relativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function SessionStatusIcon({ status }: { status: string }) {
  const color = callSessionStatusColor(status);
  if (status === "done") return <CheckCircle2 className={`w-4 h-4 shrink-0 ${color}`} />;
  if (status === "failed") return <XCircle className={`w-4 h-4 shrink-0 ${color}`} />;
  if (status === "joining" || status === "in_call") return <Loader2 className={`w-4 h-4 shrink-0 animate-spin ${color}`} />;
  return <Clock className={`w-4 h-4 shrink-0 ${color}`} />;
}

/**
 * Read-only visibility into what Call Intelligence has actually done for
 * this engagement — every Recall.ai bot dispatched, what state it's in,
 * and what Claude pulled out of the finished transcript. This is the
 * "so users can see logs and results" surface: before this existed, the
 * only signal that anything happened at all was the deliverables panel's
 * single "last synced" line — no way to see an individual call's outcome,
 * or notice a run of "failed" sessions (usually a wrong recall_region or
 * an expired API key) without digging into the database directly.
 */
export function CallIntelligenceLog({ sessions }: { sessions: ConversationIntelligenceSessionRow[] }) {
  if (sessions.length === 0) {
    return (
      <div className="space-y-2">
        <h2 className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider font-mono flex items-center gap-1.5">
          <Radio className="w-3.5 h-3.5" /> Call Intelligence Log
        </h2>
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/40 p-5 text-xs text-zinc-500 dark:text-zinc-400">
          No calls have been picked up yet — a bot dispatches automatically once a call is booked at least 10 minutes out.
        </div>
      </div>
    );
  }

  const failedCount = sessions.filter((s) => s.status === "failed").length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider font-mono flex items-center gap-1.5">
          <Radio className="w-3.5 h-3.5" /> Call Intelligence Log
        </h2>
        {failedCount > 0 && (
          <span className="text-[11px] font-mono text-rose-400 flex items-center gap-1">
            <ShieldAlert className="w-3.5 h-3.5" />
            {failedCount} failed — check the region and API key under Update credentials
          </span>
        )}
      </div>

      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/40 divide-y divide-zinc-100 dark:divide-zinc-800/60 overflow-hidden">
        {sessions.map((session) => {
          const objections = session.extractedObjections ?? [];
          return (
            <div key={session.id} className="p-3.5 space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <SessionStatusIcon status={session.status} />
                  <span className={`text-xs font-mono font-medium ${callSessionStatusColor(session.status)}`}>
                    {callSessionStatusLabel(session.status)}
                  </span>
                </div>
                <span className="text-[11px] font-mono text-zinc-400 dark:text-zinc-600 shrink-0">
                  {relativeTime(session.completedAt ?? session.createdAt)}
                </span>
              </div>

              {session.extractionSummary && (
                <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed line-clamp-2">
                  {session.extractionSummary}
                </p>
              )}

              {objections.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {objections.map((o, i) => (
                    <span
                      key={i}
                      className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400"
                    >
                      {o}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
