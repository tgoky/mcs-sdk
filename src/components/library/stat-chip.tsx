import { cn } from "@/lib/utils";

/**
 * A single real-data stat, used on the package hero and per-skill rows.
 * This is the app-store "rating" equivalent this workspace actually has —
 * live reach and health numbers instead of a fabricated star count, which
 * would imply reviews/comparisons that don't exist for a single in-house
 * package.
 */
export function StatChip({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "warning"
        ? "text-orange-600 dark:text-orange-400"
        : tone === "danger"
          ? "text-rose-600 dark:text-rose-400"
          : "text-zinc-900 dark:text-zinc-100";

  return (
    <div className="flex flex-col gap-0.5">
      <span className={cn("text-lg font-bold tabular-nums leading-none", toneClass)}>{value}</span>
      <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{label}</span>
    </div>
  );
}