import type { TemplateShowRateStat } from "@/lib/show-rate-by-template";
import { LOW_SAMPLE_THRESHOLD } from "@/lib/show-rate-by-template";

function Bar({ value }: { value: number }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-zinc-100 dark:bg-zinc-900 overflow-hidden">
      <div
        className="h-full rounded-full"
        style={{ width: `${Math.max(value, value > 0 ? 2 : 0)}%`, backgroundColor: "var(--accent)" }}
      />
    </div>
  );
}

/**
 * Which confirmation-page template shows the best real, human-confirmed
 * show rate across this operator's whole portfolio — a template-choice
 * signal, not a per-booking prediction (that's show-rate-scorer.ts,
 * unrelated to this section). Renders nothing without at least one
 * outcome logged anywhere in the portfolio — a brand-new account has no
 * signal yet, not a 0% rate worth alarming over.
 */
export function ShowRateByTemplateSection({ stats }: { stats: TemplateShowRateStat[] }) {
  const withData = stats.filter((s) => s.sampleSize > 0);

  if (withData.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-500 px-4 py-7 text-center leading-relaxed">
        No confirmed call outcomes yet. This fills in once briefs start getting marked showed / no-show.
      </p>
    );
  }

  return (
    <div className="p-4 space-y-3">
      {withData.map((s) => (
        <div key={s.template} className="space-y-1">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-zinc-700 dark:text-zinc-300">{s.name}</span>
            <span className="font-mono text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5 shrink-0">
              {s.showRatePct !== null ? `${s.showRatePct}%` : "—"}
              <span className="text-zinc-400 dark:text-zinc-600 text-xs">({s.sampleSize})</span>
              {s.sampleSize < LOW_SAMPLE_THRESHOLD && (
                <span className="text-[10px] font-mono uppercase tracking-wider text-amber-600 dark:text-amber-400" title={`Only ${s.sampleSize} resolved call${s.sampleSize !== 1 ? "s" : ""}. Too few to read much into yet.`}>
                  thin sample
                </span>
              )}
            </span>
          </div>
          <Bar value={s.showRatePct ?? 0} />
        </div>
      ))}
    </div>
  );
}
