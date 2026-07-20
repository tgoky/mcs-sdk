/**
 * Shown automatically by Next.js while dashboard/page.tsx (and any other
 * page directly under this segment) is still fetching data — most
 * importantly, the moment right after clicking "Home" and then back into
 * Showtime, or any other fresh navigation into /dashboard. Without this
 * file, Next has nothing to paint until every query in page.tsx resolves,
 * which is what previously showed as a blank page.
 *
 * Kept static (no pulse/shimmer animation) to match the rest of the app's
 * restrained visual language.
 */
export default function DashboardLoading() {
  return (
    <div className="space-y-5 w-full px-1">
      {/* Header */}
      <div className="flex flex-col space-y-3 lg:flex-row lg:justify-between lg:items-center lg:space-y-0 border-b border-zinc-200 dark:border-zinc-900 pb-3">
        <div className="space-y-2">
          <div className="h-5 w-32 rounded bg-zinc-100 dark:bg-zinc-900" />
          <div className="h-3.5 w-64 rounded bg-zinc-100 dark:bg-zinc-900" />
        </div>
        <div className="h-7 w-56 rounded bg-zinc-100 dark:bg-zinc-900" />
      </div>

      {/* Overview stats */}
      <div className="border-b border-zinc-200 dark:border-zinc-900 pb-4">
        <div className="h-3 w-20 rounded bg-zinc-100 dark:bg-zinc-900 mb-4" />
        <div className="grid gap-4 sm:grid-cols-3 pt-1 border-t border-zinc-200/60 dark:border-zinc-900/20">
          {[0, 1, 2].map((i) => (
            <div key={i} className={`space-y-2 ${i > 0 ? "sm:border-l border-zinc-200 dark:border-zinc-900 sm:pl-4" : ""}`}>
              <div className="h-3 w-24 rounded bg-zinc-100 dark:bg-zinc-900" />
              <div className="h-7 w-12 rounded bg-zinc-100 dark:bg-zinc-900" />
            </div>
          ))}
        </div>
      </div>

      {/* Activity feed */}
      <div className="pt-2">
        <div className="h-3 w-32 rounded bg-zinc-100 dark:bg-zinc-900 mb-4" />
        <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
          <div className="h-9 bg-zinc-50 dark:bg-zinc-950/50 border-b border-zinc-200 dark:border-zinc-800" />
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`h-10 flex items-center px-4 ${i !== 3 ? "border-b border-zinc-100 dark:border-zinc-800/30" : ""}`}
            >
              <div className="h-3 w-full max-w-[280px] rounded bg-zinc-100 dark:bg-zinc-900" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
