"use client";

// The "+" button pattern: lets a user pin extra filters onto their view
// (Needs attention, High priority, Paused clients, ...) that aren't shown
// by default. Two pieces of state, kept deliberately separate:
//
//   - `enabledIds` — which options are PINNED into the chip bar at all
//     (toggled from this popover; persisted by the caller)
//   - `activeIds`  — of the pinned chips, which are currently APPLIED as
//     an active filter (toggled by clicking the chip itself, in
//     FilterChipBar below)
//
// This component only renders the picker UI; every predicate and count is
// computed by the caller so the same two components work for both Queue
// and Live Executions without knowing anything about either one's data.

import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface CustomizerOption {
  id: string;
  label: string;
  count?: number;
}

export interface CustomizerSection {
  label: string;
  options: CustomizerOption[];
}

export function ViewCustomizer({
  sections,
  enabledIds,
  onToggle,
  menuTitle = "Add to this view",
}: {
  sections: CustomizerSection[];
  enabledIds: Set<string>;
  onToggle: (id: string) => void;
  menuTitle?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Customize view"
          className={cn(
            "inline-flex items-center justify-center w-7 h-7 rounded-lg border shrink-0 transition-colors duration-150 cursor-pointer active:scale-95",
            open
              ? "border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white"
              : "border-border text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 hover:text-zinc-900 dark:hover:text-zinc-200"
          )}
        >
          <Plus size={14} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[260px] p-1.5 rounded-2xl border border-border bg-white/95 dark:bg-black/95 backdrop-blur-xl text-zinc-900 dark:text-zinc-100 shadow-xl dark:shadow-2xl dark:shadow-black overflow-hidden font-sans tracking-tight antialiased"
      >
        {menuTitle && (
          <p className="px-2.5 pt-2 pb-1.5 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
            {menuTitle}
          </p>
        )}
        <div className="py-1 space-y-1 max-h-[360px] overflow-y-auto">
          {sections.map((section, i) => (
            <div key={section.label} className="space-y-0.5">
              <p className="px-2.5 pt-1.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 select-none">
                {section.label}
              </p>
              {section.options.map((opt) => {
                const active = enabledIds.has(opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onToggle(opt.id)}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[13px] text-left text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition-colors cursor-pointer"
                  >
                    <span
                      className={cn(
                        "w-4 h-4 rounded-[5px] border flex items-center justify-center shrink-0 transition-colors",
                        active
                          ? "bg-zinc-900 dark:bg-white border-zinc-900 dark:border-white"
                          : "border-zinc-300 dark:border-zinc-700"
                      )}
                    >
                      {active && <Check size={11} className="text-white dark:text-zinc-900" strokeWidth={3} />}
                    </span>
                    <span className="flex-1 truncate">{opt.label}</span>
                    {typeof opt.count === "number" && (
                      <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-600 tabular-nums">
                        {opt.count}
                      </span>
                    )}
                  </button>
                );
              })}
              {i < sections.length - 1 && <div className="my-1.5 border-t border-zinc-100 dark:border-zinc-800/80" />}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export interface FilterChip {
  id: string;
  label: string;
  count?: number;
}

/** Renders the chips the user has pinned via ViewCustomizer; clicking one toggles it on/off as an active filter. */
export function FilterChipBar({
  chips,
  activeIds,
  onToggle,
}: {
  chips: FilterChip[];
  activeIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  if (chips.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {chips.map((chip) => {
        const active = activeIds.has(chip.id);
        return (
          <button
            key={chip.id}
            type="button"
            onClick={() => onToggle(chip.id)}
            className={cn(
              "inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium border transition-colors cursor-pointer",
              active
                ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 border-zinc-900 dark:border-white"
                : "bg-transparent text-zinc-500 dark:text-zinc-400 border-border hover:border-zinc-300 dark:hover:border-zinc-700 hover:text-zinc-700 dark:hover:text-zinc-200"
            )}
          >
            {chip.label}
            {typeof chip.count === "number" && (
              <span className={cn("font-mono tabular-nums", active ? "opacity-80" : "text-zinc-400 dark:text-zinc-600")}>
                {chip.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
