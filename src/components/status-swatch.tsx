import { MODULE_STATUS_LABELS, type ModuleStatus } from "@/lib/copy";

/**
 * Small color square + label — replaces the colored-background rounded
 * pill every module/skill status used to render as
 * (`bg-zinc-100 ... ${MODULE_STATUS_COLORS[status]}`). Same status set,
 * same wording (MODULE_STATUS_LABELS is untouched), just a flatter,
 * legend-style treatment: a solid swatch carries the color, the text
 * stays plain. Shared by Showtime's SkillsPanel and Reputation Manager's
 * RepSkillsPanel so both products render status identically.
 */
const SWATCH_COLOR: Record<ModuleStatus | "disabled", string> = {
  live: "bg-emerald-500",
  running: "bg-sky-500",
  failed: "bg-rose-500",
  not_run: "bg-zinc-400 dark:bg-zinc-600",
  paused: "bg-amber-500",
  disabled: "bg-zinc-300 dark:bg-zinc-700",
};

const SWATCH_LABEL: Record<ModuleStatus | "disabled", string> = {
  ...MODULE_STATUS_LABELS,
  disabled: "Turned off",
};

export function StatusSwatch({ status }: { status: ModuleStatus | "disabled" }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-[2.5px] shrink-0 ${SWATCH_COLOR[status]}`} aria-hidden="true" />
      <span className="text-[10px] font-mono font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
        {SWATCH_LABEL[status]}
      </span>
    </span>
  );
}
