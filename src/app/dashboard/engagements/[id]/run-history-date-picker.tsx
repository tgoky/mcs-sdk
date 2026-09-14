"use client";

// The one piece of Run History's filtering the month stepper next to it
// can't do — jump straight to one specific day instead of stepping
// month by month to find it. A plain native <input type="date"> rather
// than a custom calendar widget: it's real, works with keyboard/mobile
// pickers for free, and this list is a utility, not a place that needs
// its own bespoke calendar UI. Picking a date always supersedes the
// month filter (the page.tsx caller drops `month` whenever `date` is
// present) since a specific day is strictly more precise than a month.

import { useRouter } from "next/navigation";
import { Calendar } from "lucide-react";

export function RunHistoryDatePicker({
  engagementId,
  skill,
  value,
}: {
  engagementId: string;
  /** Preserved across the jump so switching dates doesn't also clear a
   * skill filter someone already picked. */
  skill?: string;
  /** yyyy-mm-dd, or undefined when no specific day is selected. */
  value?: string;
}) {
  const router = useRouter();

  function onChange(next: string) {
    const params = new URLSearchParams();
    if (skill) params.set("skill", skill);
    if (next) params.set("date", next);
    const qs = params.toString();
    router.push(`/dashboard/engagements/${engagementId}${qs ? `?${qs}` : ""}#run-history`, { scroll: false });
  }

  return (
    <label
      className="flex items-center gap-1.5 h-6 px-2 rounded-md border border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
      title="Jump to a specific date"
    >
      <Calendar className="w-3 h-3 shrink-0" />
      <input
        type="date"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent text-[11px] font-mono cursor-pointer outline-none [color-scheme:light] dark:[color-scheme:dark]"
      />
    </label>
  );
}
