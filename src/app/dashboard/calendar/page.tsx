import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { getCalendarEventsInRange } from "@/lib/calendar-events";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { CalendarAgenda } from "./calendar-agenda";

export const revalidate = 0;

function monthLabel(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString([], { month: "long", year: "numeric" });
}

function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const total = year * 12 + (month - 1) + delta;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month: monthParam } = await searchParams;
  const now = new Date();
  const [year, month] = monthParam?.match(/^\d{4}-\d{2}$/)
    ? monthParam.split("-").map(Number)
    : [now.getFullYear(), now.getMonth() + 1];

  const rangeStart = new Date(Date.UTC(year, month - 1, 1));
  const rangeEnd = new Date(Date.UTC(year, month, 1));

  const session = await getSession();
  const whopUserId = session.whopUserId!;
  const activeWorkspace = await getActiveWorkspace(whopUserId);
  const events = await getCalendarEventsInRange(whopUserId, activeWorkspace.workspaceId, rangeStart, rangeEnd);

  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);
  const prevHref = `/dashboard/calendar?month=${prev.year}-${String(prev.month).padStart(2, "0")}`;
  const nextHref = `/dashboard/calendar?month=${next.year}-${String(next.month).padStart(2, "0")}`;

  return (
    <div className="flex flex-col h-full w-full mx-auto tracking-tight antialiased font-sans px-1 text-zinc-600 dark:text-zinc-400 transition-colors duration-200">
      <div className="shrink-0 flex items-center justify-between gap-3 border-b border-zinc-200 dark:border-zinc-800/80 pb-3">
        <div className="flex items-center gap-3">
          <span
            className="flex items-center justify-center w-8 h-8 rounded-full shrink-0"
            style={{ background: "var(--accent-dim)", color: "var(--text-secondary)" }}
          >
            <CalendarDays size={16} />
          </span>
          <div className="space-y-0.5">
            <h1 className="text-base font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">Calendar</h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Every call, Win-Back touch, and Leak Map audit across all of {activeWorkspace.name} — everything
              on the calendar for whichever month you&apos;re looking at, forward or back.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Link
            href={prevHref}
            className="flex items-center justify-center w-7 h-7 rounded-md text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft size={14} />
          </Link>
          <span className="text-xs font-bold font-mono w-32 text-center" style={{ color: "var(--text-primary)" }}>
            {monthLabel(year, month)}
          </span>
          <Link
            href={nextHref}
            className="flex items-center justify-center w-7 h-7 rounded-md text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
            aria-label="Next month"
          >
            <ChevronRight size={14} />
          </Link>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-4">
        <CalendarAgenda events={events} />
      </div>
    </div>
  );
}
