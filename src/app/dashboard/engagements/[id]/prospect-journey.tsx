"use client";

// One person's journey across the products this client has on
// (lib/prospect-timeline.ts), shown for the booking selected in the
// calendar: cold email, reply, booked, reminders with their receipts,
// text replies, showed or not, recovery, paid, refunded or disputed.

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { ProspectTimeline, TimelineEvent, TimelineProduct } from "@/lib/prospect-timeline";

const PRODUCT_LABEL: Record<TimelineProduct, string> = {
  "cold-open": "Cold Open",
  showtime: "Showtime",
  "whop-agent": "Whop",
  "reputation-manager": "Reputation",
};

export function money(v: { value: number; currency: string }): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: v.currency.toUpperCase(), maximumFractionDigits: v.value % 1 === 0 ? 0 : 2 }).format(v.value);
  } catch {
    return `${v.value.toLocaleString()} ${v.currency.toUpperCase()}`;
  }
}

/** The steps reached, in order, as one line: "Emailed → Replied → Booked → Showed → Paid $3,000". */
export function journeyLine(t: Pick<ProspectTimeline, "summary">): string[] {
  const s = t.summary;
  const out: string[] = [];
  if (s.emailed) out.push("Emailed");
  if (s.replied) out.push("Replied");
  if (s.booked) out.push("Booked");
  if (s.showed === true) out.push("Showed");
  if (s.showed === false) out.push("No-show");
  if (s.paid) out.push(`Paid ${money(s.paid)}`);
  if (s.refunded) out.push(`Refunded ${money(s.refunded)}`);
  if (s.disputed) out.push("Disputed");
  return out;
}

function when(at: string): string {
  return new Date(at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function Row({ e }: { e: TimelineEvent }) {
  return (
    <li className="relative pl-4">
      <span className={cn("absolute left-0 top-1.5 h-1.5 w-1.5 rounded-full", e.warn ? "bg-rose-500" : "bg-zinc-400 dark:bg-zinc-500")} />
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <span className={cn("text-[12px] font-medium", e.warn ? "text-rose-600 dark:text-rose-400" : "text-zinc-900 dark:text-zinc-100")}>
          {e.title}
          {e.amount ? <> · {money(e.amount)}</> : null}
        </span>
        <span className="font-mono text-[10.5px] text-zinc-500">{when(e.at)}</span>
      </div>
      {e.detail && <p className="text-[11.5px] text-zinc-600 dark:text-zinc-400">{e.detail}</p>}
      <p className="text-[10.5px] text-zinc-500">
        {PRODUCT_LABEL[e.product]}
        {e.proof ? <> · {e.proof}</> : null}
      </p>
    </li>
  );
}

export function ProspectJourney({ engagementId, bookingId }: { engagementId: string; bookingId: string }) {
  const [state, setState] = useState<{ key: string; data: ProspectTimeline | null; error: string | null } | null>(null);
  const key = `${engagementId}:${bookingId}`;

  useEffect(() => {
    let live = true;
    fetch(`/api/engagements/${encodeURIComponent(engagementId)}/prospect-timeline?bookingId=${encodeURIComponent(bookingId)}`, { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!live) return;
        setState(res.ok ? { key, data: body as ProspectTimeline, error: null } : { key, data: null, error: (body as { error?: string }).error ?? "Couldn't load this journey." });
      })
      .catch(() => live && setState({ key, data: null, error: "Couldn't load this journey." }));
    return () => {
      live = false;
    };
  }, [engagementId, bookingId, key]);

  if (!state || state.key !== key) return <p className="text-xs text-zinc-500">Loading the journey…</p>;
  if (state.error || !state.data) return <p className="text-xs text-rose-600 dark:text-rose-400">{state.error}</p>;

  const t = state.data;
  const line = journeyLine(t);
  return (
    <div className="space-y-3 text-xs font-sans">
      {line.length > 0 && <p className="text-[12px] font-medium text-zinc-900 dark:text-zinc-100">{line.join(" → ")}</p>}
      {t.events.length === 0 ? (
        <p className="text-zinc-500">Nothing recorded for this person yet.</p>
      ) : (
        <ol className="space-y-2.5">
          {t.events.map((e, i) => (
            <Row key={`${e.at}-${i}`} e={e} />
          ))}
        </ol>
      )}
    </div>
  );
}
