/**
 * The raw primitive behind the colored-square-then-label convention —
 * StatusSwatch (module/skill status) and module-client-roster.tsx's own
 * status badge both render through this so the physical treatment (a
 * small solid square, plain text label, no pill background) can't drift
 * between the two even though each has its own status vocabulary
 * (ModuleStatus's 5 states vs. this roster's coarser success/warning/
 * danger/neutral tones).
 */
export function SwatchLabel({ colorClass, label }: { colorClass: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-[2.5px] shrink-0 ${colorClass}`} aria-hidden="true" />
      <span className="text-[10px] font-mono font-bold text-zinc-600 dark:text-zinc-400">
        {label}
      </span>
    </span>
  );
}
