"use client";

// Phase 3's "preview-first entry point," extended to the workers that
// produce no visual artifact to preview (pile-on, source-connect,
// send-connect, daily-send, win-back, whop-bridge-manager — found in this
// session's own follow-up review to have nothing a content preview could
// show). Rather than force a fake preview onto them, this translates the
// CURRENT form state into a plain-language statement of what will
// actually happen when the worker runs — computed live from real values,
// same honesty level as a content preview, just narrower in form (a
// sentence, not a rendered artifact).
//
// Each line is the caller's own responsibility to compute correctly from
// its real save-payload shape — this component only renders them
// consistently.


export function BehaviorSummary({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      <p className="px-3 pt-3 text-xs font-semibold text-[var(--text-secondary)]">What happens</p>
      <ul className="p-3 pt-2 space-y-1.5">
        {lines.map((line, i) => (
          <li key={i} className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed flex items-start gap-2">
            <span className="text-zinc-300 dark:text-zinc-700 mt-0.5">•</span>
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
