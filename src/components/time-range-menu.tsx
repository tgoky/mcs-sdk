"use client";

// A reusable "By Hunter"-style time-range dropdown, generalized: instead of
// filtering to a saved list, it narrows any table's rows to a date window.
// "Today" expands in place into a finer choice (all of today / last 12h /
// last 4h) rather than being its own flat option, since a poll-driven table
// like Live Executions needs finer granularity than a day boundary once
// there's real volume moving through it.

import { useState } from "react";
import { Check, ChevronDown, ChevronRight, Clock } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type TimeRangeValue =
  | "all"
  | "today_all"
  | "today_12h"
  | "today_4h"
  | "7d"
  | "this_week"
  | "this_month"
  | "last_month";

export interface TimeRangeBounds {
  from: Date | null;
  /** Exclusive upper bound. null means "up to now". */
  to: Date | null;
}

const TODAY_VALUES: TimeRangeValue[] = ["today_all", "today_12h", "today_4h"];

const TODAY_SUB: { key: TimeRangeValue; label: string }[] = [
  { key: "today_all", label: "All of today" },
  { key: "today_12h", label: "Last 12 hours" },
  { key: "today_4h", label: "Last 4 hours" },
];

const OTHER_OPTIONS: { key: TimeRangeValue; label: string }[] = [
  { key: "7d", label: "Last 7 days" },
  { key: "this_week", label: "This week" },
  { key: "this_month", label: "This month" },
  { key: "last_month", label: "Last month" },
];

export function timeRangeLabel(value: TimeRangeValue): string {
  if (value === "all") return "All time";
  const today = TODAY_SUB.find((o) => o.key === value);
  if (today) return today.label;
  return OTHER_OPTIONS.find((o) => o.key === value)?.label ?? "All time";
}

/** Computes the [from, to) window for a given preset, anchored to "now". */
export function computeTimeRangeBounds(value: TimeRangeValue): TimeRangeBounds {
  const now = new Date();

  switch (value) {
    case "today_all": {
      const from = new Date(now);
      from.setHours(0, 0, 0, 0);
      return { from, to: null };
    }
    case "today_12h":
      return { from: new Date(now.getTime() - 12 * 3_600_000), to: null };
    case "today_4h":
      return { from: new Date(now.getTime() - 4 * 3_600_000), to: null };
    case "7d":
      return { from: new Date(now.getTime() - 7 * 86_400_000), to: null };
    case "this_week": {
      const from = new Date(now);
      const day = (from.getDay() + 6) % 7; // Monday = 0
      from.setDate(from.getDate() - day);
      from.setHours(0, 0, 0, 0);
      return { from, to: null };
    }
    case "this_month": {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from, to: null };
    }
    case "last_month": {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const to = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from, to };
    }
    default:
      return { from: null, to: null };
  }
}

export function isWithinTimeRange(iso: string, bounds: TimeRangeBounds): boolean {
  const t = new Date(iso).getTime();
  if (bounds.from && t < bounds.from.getTime()) return false;
  if (bounds.to && t >= bounds.to.getTime()) return false;
  return true;
}

export function TimeRangeMenu({
  value,
  onChange,
}: {
  value: TimeRangeValue;
  onChange: (value: TimeRangeValue) => void;
}) {
  const [open, setOpen] = useState(false);
  const [todayExpanded, setTodayExpanded] = useState(TODAY_VALUES.includes(value));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors cursor-pointer shrink-0"
        >
          <Clock size={12} />
          {timeRangeLabel(value)}
          <ChevronDown size={12} className="text-zinc-400" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[220px] p-1.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-black/95 backdrop-blur-xl shadow-xl overflow-hidden font-sans"
      >
        <div className="space-y-0.5">
          <button
            type="button"
            onClick={() => setTodayExpanded((e) => !e)}
            className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-[13px] font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-2">
              {TODAY_VALUES.includes(value) && <Check size={13} />}
              Today
            </span>
            <ChevronRight
              size={13}
              className={cn("text-zinc-400 transition-transform", todayExpanded && "rotate-90")}
            />
          </button>

          {todayExpanded && (
            <div className="pl-3 ml-3 space-y-0.5 border-l border-zinc-100 dark:border-zinc-800">
              {TODAY_SUB.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => {
                    onChange(opt.key);
                    setOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[12px] text-left transition-colors cursor-pointer",
                    value === opt.key
                      ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white font-medium"
                      : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 hover:text-zinc-800 dark:hover:text-zinc-200"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          <div className="my-1 border-t border-zinc-100 dark:border-zinc-800/80" />

          {OTHER_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => {
                onChange(opt.key);
                setOpen(false);
              }}
              className={cn(
                "w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-[13px] text-left transition-colors cursor-pointer",
                value === opt.key
                  ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white font-medium"
                  : "text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/80"
              )}
            >
              {value === opt.key && <Check size={13} />}
              {opt.label}
            </button>
          ))}

          <div className="my-1 border-t border-zinc-100 dark:border-zinc-800/80" />

          <button
            type="button"
            onClick={() => {
              onChange("all");
              setOpen(false);
            }}
            className={cn(
              "w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-[13px] text-left transition-colors cursor-pointer",
              value === "all"
                ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white font-medium"
                : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
            )}
          >
            {value === "all" && <Check size={13} />}
            All time
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
