import { Radar, Star, MessageCircle, FileEdit, CheckCircle2, Send, Flag, ShieldAlert, Mail, ClipboardList } from "lucide-react";
import type { RepAuditEventRow } from "@/features/reputation-manager/server/audit-log";

const EVENT_ICONS: Record<string, React.ElementType> = {
  detection: Radar,
  draft: FileEdit,
  approval: CheckCircle2,
  external_action: Send,
  outcome: Flag,
  compliance_block: ShieldAlert,
  ai_engine_notice: Mail,
  reflection: ClipboardList,
};

const SOURCE_ICONS: Record<string, React.ElementType> = {
  trustpilot: Star,
  reddit: MessageCircle,
};

/** One-line summary per event type, reading straight off the payload
 * shape each type carries (audit-log-schema.md) — same fields
 * audit-log.ts's RepAuditEvent union types, just formatted for display. */
function eventSummary(row: RepAuditEventRow): string {
  const p = row.payload;
  switch (row.eventType) {
    case "detection":
      return `${String(p.source)} — ${String(p.sentimentLabel ?? "unscored")}${p.threatCategory ? ` · ${p.threatCategory}` : ""}`;
    case "draft":
      return `Draft (${String(p.draftClass)}) — tier ${p.tier ?? "?"}`;
    case "approval":
      return `${String(p.approver)} — ${String(p.decision)}`;
    case "external_action":
      return `Published to ${String(p.channel)} — ${String(p.status)}`;
    case "outcome":
      return String(p.outcomeType);
    case "compliance_block":
      return `Blocked — ${String(p.blockReason)}`;
    case "ai_engine_notice":
      return `Notice sent to ${String(p.vendor)}`;
    case "reflection":
      return `${String(p.period)} reflection — ${p.eventsReviewed ?? 0} event(s) reviewed`;
    default:
      return row.eventType;
  }
}

function eventExcerpt(row: RepAuditEventRow): string | null {
  const p = row.payload;
  if (row.eventType === "detection" && typeof p.mentionText === "string") return p.mentionText;
  return null;
}

/**
 * The engagement detail page's view onto this client's audit trail
 * (audit-log-schema.md, ported to a real table in rep_audit_events —
 * see audit-log.ts's file comment for why a table instead of the
 * original's JSON-Lines file). Only "detection" has a live producer
 * today (the three ingestion skills); the other seven event types
 * render fine here whenever something starts writing them.
 */
export function RepAuditLogPanel({ events }: { events: RepAuditEventRow[] }) {
  return (
    <div className="w-full space-y-3 font-sans">
      <div className="flex items-center justify-between gap-4 pb-1.5 border-b border-zinc-200/80 dark:border-zinc-800/60">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider font-mono text-zinc-900 dark:text-zinc-100">Audit Log</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed font-sans">
            Every detection, draft, approval, and action recorded for this client — most recent first.
          </p>
        </div>
      </div>

      {events.length === 0 ? (
        <p className="text-xs text-zinc-400 dark:text-zinc-500 italic font-mono py-2">No events recorded yet.</p>
      ) : (
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
          {events.map((row) => {
            const EventIcon = EVENT_ICONS[row.eventType] ?? Radar;
            const SourceIcon = typeof row.payload.source === "string" ? SOURCE_ICONS[row.payload.source] : undefined;
            const Icon = SourceIcon ?? EventIcon;
            const excerpt = eventExcerpt(row);
            return (
              <div key={row.id} className="flex items-start gap-2.5 py-2">
                <Icon className="w-3.5 h-3.5 mt-0.5 text-zinc-400 dark:text-zinc-500 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate">{eventSummary(row)}</p>
                    <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-600 shrink-0">
                      {new Date(row.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </span>
                  </div>
                  {excerpt && <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-1 font-mono">{excerpt}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
