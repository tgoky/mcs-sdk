/**
 * Shown while page.tsx's session/workspace/client-list/report-metrics
 * queries resolve — same reasoning as calendar/loading.tsx and
 * teammates/loading.tsx: revalidate=0 means every visit and every client
 * switch (now driven by the sidebar, see reports-client-links.tsx) is a
 * real round trip, this route just never had a loading boundary to paint
 * something during it.
 */
export default function ReportsLoading() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <div className="space-y-2">
        <div className="h-5 w-24 rounded-sm bg-zinc-100 dark:bg-zinc-900" />
        <div className="h-3 w-full max-w-2xl rounded-sm bg-zinc-100 dark:bg-zinc-900" />
        <div className="h-3 w-2/3 max-w-2xl rounded-sm bg-zinc-100 dark:bg-zinc-900" />
      </div>

      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800/80 bg-white/80 dark:bg-zinc-900/50 p-6 space-y-6">
        <div className="flex items-center gap-2">
          {["This week", "This month", "All time"].map((label) => (
            <div key={label} className="h-7 w-20 rounded-lg bg-zinc-100 dark:bg-zinc-900" />
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-3 w-20 rounded-sm bg-zinc-100 dark:bg-zinc-900" />
              <div className="h-6 w-12 rounded-sm bg-zinc-100 dark:bg-zinc-900" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
