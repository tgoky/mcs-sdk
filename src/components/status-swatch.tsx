import { MODULE_STATUS_LABELS, type ModuleStatus } from "@/lib/copy";
import { SwatchLabel } from "@/components/swatch-label";

/**
 * Small color square + label — replaces the colored-background rounded
 * pill every module/skill status used to render as
 * (`bg-zinc-100 ... ${MODULE_STATUS_COLORS[status]}`). Same status set,
 * same wording (MODULE_STATUS_LABELS is untouched), just a flatter,
 * legend-style treatment: a solid swatch carries the color, the text
 * stays plain. Shared by WorkersPanel (both Showtime's and Reputation
 * Manager's workers) so every product renders status identically.
 */
const SWATCH_COLOR: Record<ModuleStatus | "disabled", string> = {
  live: "bg-emerald-500",
  running: "bg-sky-500",
  failed: "bg-rose-500",
  // Every status gets a real, distinct color — no gray. "Not started yet"
  // and "Turned off" are both genuinely neutral outcomes (neither good nor
  // bad), but "neutral" doesn't have to mean "colorless" — violet and pink
  // read as clearly their own category without implying success or failure.
  not_run: "bg-violet-400",
  paused: "bg-amber-500",
  disabled: "bg-pink-400",
};

const SWATCH_LABEL: Record<ModuleStatus | "disabled", string> = {
  ...MODULE_STATUS_LABELS,
  disabled: "Turned off",
};

export function StatusSwatch({ status }: { status: ModuleStatus | "disabled" }) {
  return <SwatchLabel colorClass={SWATCH_COLOR[status]} label={SWATCH_LABEL[status]} />;
}
