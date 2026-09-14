// Shared loading placeholder for every worker config form's initial
// fetch. Every one of these forms used to fall back to a single line of
// plain "Loading…" text while its data loaded — no motion, nothing that
// resembled the form about to appear, so the swap from that line to the
// real form read as a jolt instead of a continuation. This renders a
// soft, pulsing skeleton shaped like the form itself (a few label+field
// pairs) so the loading state and the loaded state feel like the same
// surface, not two unrelated screens.
export function ConfigFormSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-5 py-1 animate-pulse" role="status" aria-label="Loading configuration">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="space-y-1.5">
          <div className="h-2 w-24 rounded-full bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-8 w-full max-w-md rounded-lg bg-zinc-100 dark:bg-zinc-900/80 border border-zinc-200/60 dark:border-zinc-800/60" />
        </div>
      ))}
    </div>
  );
}
