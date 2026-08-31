/**
 * Shown automatically by Next.js the instant you click prev/next month (or
 * land on /dashboard/calendar fresh) — while page.tsx's session lookup,
 * workspace lookup, and getCalendarEventsInRange query are still running.
 *
 * This route had no loading.tsx, unlike dashboard/page.tsx. Every ?month=
 * link is a real server round trip (revalidate=0, three sequential awaits
 * in page.tsx) — the client-side flip transition CalendarView plays is real
 * and fast (~320ms), but it can't start until that round trip finishes, and
 * with nothing painted in the meantime a multi-hundred-ms fetch reads as a
 * dead click, not a fast app doing a flip. This is the fix: paint the exact
 * shape of the real page immediately, so the round trip is felt as "already
 * loading" rather than "did that even register."
 *
 * Sized to match calendar-view.tsx's actual layout (8/4-col split) and
 * calendar-month-grid.tsx's real grid (7 cols, min-h-[92px] cells, rounded-2xl
 * border shadow-xl) so there's no layout shift when real content streams in.
 * Static blocks, no shimmer — same restrained convention as dashboard/loading.tsx.
 */
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function CalendarLoading() {
  return (
    <div className="flex flex-col h-full w-full mx-auto tracking-tight antialiased font-sans px-1 text-zinc-600 dark:text-zinc-400">
      {/* Header — mirrors page.tsx's real header exactly, prev/next included,
          so the month label swapping for a skeleton bar is the only visible change. */}
      <div className="shrink-0 flex items-center justify-between gap-3 border-b border-zinc-200 dark:border-zinc-800/80 pb-3">
        <div className="flex items-center gap-3">
          <span
            className="flex items-center justify-center w-8 h-8 rounded-full shrink-0"
            style={{ background: "var(--accent-dim)", color: "var(--text-secondary)" }}
          >
            <div className="w-4 h-4 rounded-sm bg-zinc-300/60 dark:bg-zinc-700/60" />
          </span>
          <div className="space-y-1.5">
            <div className="h-4 w-20 rounded-sm bg-zinc-100 dark:bg-zinc-900" />
            <div className="h-3 w-72 rounded-sm bg-zinc-100 dark:bg-zinc-900" />
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <div className="w-7 h-7 rounded-md bg-zinc-100 dark:bg-zinc-900" />
          <div className="h-3.5 w-24 mx-1 rounded-sm bg-zinc-100 dark:bg-zinc-900" />
          <div className="w-7 h-7 rounded-md bg-zinc-100 dark:bg-zinc-900" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-4">
        <div className="space-y-3">
          {/* Month/List toggle */}
          <div className="h-7 w-32 rounded-lg bg-zinc-200/60 dark:bg-zinc-900 border border-transparent" />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
            {/* Month grid skeleton — same 8-col span, same border/shadow container as the real grid */}
            <div className="lg:col-span-8">
              <div
                className="overflow-hidden rounded-2xl border shadow-xl font-sans"
                style={{ borderColor: "var(--border)", background: "var(--surface)" }}
              >
                <div
                  className="grid grid-cols-7 border-b text-center text-[10px] font-bold uppercase tracking-wider"
                  style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
                >
                  {WEEKDAY_LABELS.map((d) => (
                    <div key={d} className="border-r py-2 last:border-r-0" style={{ borderColor: "var(--border)" }}>
                      {d}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 auto-rows-fr">
                  {Array.from({ length: 42 }).map((_, idx) => (
                    <div
                      key={idx}
                      className="min-h-[92px] flex flex-col gap-1 border-b border-r p-1.5"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <div className="h-5 w-5 rounded-full bg-zinc-100 dark:bg-zinc-900" />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Day inspector skeleton — same dashed empty-state shape as the real DayInspector's idle state */}
            <div className="lg:col-span-4">
              <div
                className="flex flex-col items-center justify-center gap-2 min-h-[200px] h-full rounded-2xl border border-dashed p-6"
                style={{ borderColor: "var(--border)" }}
              >
                <div className="w-[18px] h-[18px] rounded-sm bg-zinc-100 dark:bg-zinc-900" />
                <div className="h-3 w-32 rounded-sm bg-zinc-100 dark:bg-zinc-900" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
