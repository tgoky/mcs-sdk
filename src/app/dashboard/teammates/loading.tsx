/**
 * Shown while page.tsx's session/workspace/thread-list queries resolve.
 * Added proactively, same reasoning as the calendar/loading.tsx fix this
 * session: revalidate=0 means every fresh visit to this route is a real
 * round trip, and without a loading boundary here too it'd hit the exact
 * same "nothing painted until the fetch lands" problem just fixed on
 * Calendar. Static, no shimmer — same convention as dashboard/loading.tsx.
 *
 * Note this only covers the initial page load. Switching threads via the
 * rail afterward is pure client state (see teammates-workspace.tsx) and
 * never re-triggers this — that's the whole reason it stays client-side.
 */
export default function TeammatesLoading() {
  return (
    <div className="flex flex-col h-full w-full mx-auto tracking-tight antialiased font-sans px-1">
      <div className="shrink-0 flex items-center gap-3 border-b border-zinc-200 dark:border-zinc-800/80 pb-3">
        <span className="flex items-center justify-center w-8 h-8 rounded-full shrink-0 bg-zinc-100 dark:bg-zinc-900" />
        <div className="space-y-1.5">
          <div className="h-4 w-24 rounded-sm bg-zinc-100 dark:bg-zinc-900" />
          <div className="h-3 w-72 rounded-sm bg-zinc-100 dark:bg-zinc-900" />
        </div>
      </div>

      <div className="flex-1 min-h-0 mt-3 flex gap-3">
        <div className="w-56 shrink-0 rounded-xl border border-zinc-200 dark:border-zinc-800/80 p-1.5 space-y-1">
          <div className="h-8 rounded-lg bg-zinc-100 dark:bg-zinc-900" />
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-9 rounded-lg bg-zinc-50 dark:bg-zinc-900/50" />
          ))}
        </div>
        <div className="flex-1 rounded-xl border border-zinc-200 dark:border-zinc-800/80" />
      </div>
    </div>
  );
}
