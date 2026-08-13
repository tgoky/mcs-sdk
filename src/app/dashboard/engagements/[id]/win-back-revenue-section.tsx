"use client";

import React, { useState, useRef, useEffect } from "react";
import { 
  DollarSign, 
  ChevronDown, 
  Check, 
  Calendar, 
  CheckCircle2, 
  XCircle,
  TrendingUp,
  Sparkles
} from "lucide-react";
import { skillName } from "@/lib/copy";

export interface RecoveredEnrollment {
  prospectEmail: string;
  prospectName: string | null;
  rebookedAt: string;
}

export interface WinBackRevenueSectionProps {
  engagementId: string;
  offerPrice: number;
  initialEnrollments: RecoveredEnrollment[];
  initialPeriodLabel: string;
}

type PeriodOption = {
  id: string;
  label: string;
  sublabel: string;
  badge?: string;
  months: { name: string; year: number; monthIdx: number }[];
};

// Generates the current quarter plus the 3 preceding it, computed from
// today's date — this used to hardcode Q1–Q4 2026 by name, so the
// flagship revenue view would show nothing at all once the calendar
// rolled into 2027. "Current" always tracks whichever quarter contains
// today, not a fixed year.
function getPeriodOptions(referenceDate: Date = new Date()): PeriodOption[] {
  const currentQuarterIdx = Math.floor(referenceDate.getMonth() / 3); // 0-3
  const currentYear = referenceDate.getFullYear();

  const options: PeriodOption[] = [];
  for (let back = 0; back < 4; back++) {
    // Walk backwards from the current quarter, wrapping the year at Q1.
    const absoluteQuarter = currentYear * 4 + currentQuarterIdx - back;
    const year = Math.floor(absoluteQuarter / 4);
    const quarterIdx = ((absoluteQuarter % 4) + 4) % 4; // 0-3, safe for negative years
    const startMonthIdx = quarterIdx * 3;

    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];
    const months = [0, 1, 2].map((offset) => ({
      name: `${monthNames[startMonthIdx + offset]} ${year}`,
      year,
      monthIdx: startMonthIdx + offset,
    }));

    const startDate = new Date(year, startMonthIdx, 1);
    const endDate = new Date(year, startMonthIdx + 3, 0); // last day of the quarter
    const fmt = (d: Date) =>
      `${monthNames[d.getMonth()].slice(0, 3)} ${d.getDate()}`;

    options.push({
      id: `q${quarterIdx + 1}_${year}`,
      label: `Q${quarterIdx + 1} ${year}`,
      sublabel: `${fmt(startDate)} - ${fmt(endDate)}, ${year}`,
      badge: back === 0 ? "Current" : undefined,
      months,
    });
  }
  return options;
}

// Utility to get initials for pink avatar badge (e.g. "AD")
function getInitials(name: string | null, email: string): string {
  if (name && name.trim().length > 0) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

// Define 4 distinct weeks for any month
const WEEKS_IN_MONTH = [
  { weekNum: 1, label: "Week 1", dayStart: 1, dayEnd: 7 },
  { weekNum: 2, label: "Week 2", dayStart: 8, dayEnd: 14 },
  { weekNum: 3, label: "Week 3", dayStart: 15, dayEnd: 21 },
  { weekNum: 4, label: "Week 4", dayStart: 22, dayEnd: 31 },
];

export function WinBackRevenueSection({
  engagementId,
  offerPrice,
  initialEnrollments,
  initialPeriodLabel,
}: WinBackRevenueSectionProps) {
  const periods = getPeriodOptions();
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodOption>(periods[0]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Total enrollments in current quarter
  const totalQuarterEnrollments = initialEnrollments.filter((r) => {
    const d = new Date(r.rebookedAt);
    return selectedPeriod.months.some(
      (m) => d.getFullYear() === m.year && d.getMonth() === m.monthIdx
    );
  });

  const recoveredCount = totalQuarterEnrollments.length;
  const totalRevenue = recoveredCount * offerPrice;
  const averageRecoveryValue = recoveredCount > 0 ? totalRevenue / recoveredCount : 0;

  return (
    <div className="space-y-4">
      {/* ── HEADER WITH ASANA-STYLE PERIOD SELECTOR DROPDOWN ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider font-mono flex items-center gap-1.5">
          <DollarSign className="w-3.5 h-3.5 text-emerald-500" /> 
          Win-Back Revenue &amp; Milestone Breakdown
        </h2>

        {/* Asana-Style Dropdown Selector (Matching Screenshot 1) */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <Calendar size={13} className="text-zinc-500" />
            <span>{selectedPeriod.label} ({selectedPeriod.sublabel})</span>
            <ChevronDown size={14} className="text-zinc-400 ml-1" />
          </button>

          {/* Screenshot 1 Popup Styling */}
          {dropdownOpen && (
            <div className="absolute right-0 mt-1.5 w-72 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xl dark:shadow-2xl z-50 p-1.5 space-y-0.5 animate-in fade-in-50 zoom-in-95 duration-100">
              <div className="px-2.5 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                Select Reporting Period
              </div>
              {periods.map((p) => {
                const isSelected = p.id === selectedPeriod.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setSelectedPeriod(p);
                      setDropdownOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left text-xs transition-colors cursor-pointer ${
                      isSelected
                        ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white font-semibold"
                        : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${isSelected ? "text-zinc-900 dark:text-white" : "opacity-0"}`}>
                        <Check size={12} strokeWidth={3} />
                      </div>
                      <div className="min-w-0">
                        <span className="block font-medium truncate">{p.label}</span>
                        <span className="block text-[10px] text-zinc-400 font-mono truncate">{p.sublabel}</span>
                      </div>
                    </div>

                    {p.badge && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-zinc-200/80 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium shrink-0">
                        {p.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── TOP STATS SUMMARY BAR ── */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/50 p-4 shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1 p-2">
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 font-mono uppercase tracking-wider">
              Recovered Deals
            </p>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
                {recoveredCount}
              </p>
              <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400 font-medium">
                {recoveredCount > 0 ? "Active pipeline" : "No recoveries yet"}
              </span>
            </div>
          </div>

          <div className="space-y-1 p-2 sm:border-l border-zinc-100 dark:border-zinc-800/60">
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 font-mono uppercase tracking-wider">
              Revenue Attributed
            </p>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
              ${totalRevenue.toLocaleString()}
            </p>
          </div>

          <div className="space-y-1 p-2 sm:border-l border-zinc-100 dark:border-zinc-800/60">
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 font-mono uppercase tracking-wider">
              Avg / Recovery
            </p>
            <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
              ${Math.round(averageRecoveryValue).toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* ── 3 MONTH HOUSING COLUMNS (CONTAINERS) ── */}
      <div className="space-y-2 pt-1">
        <div className="flex items-center justify-between px-0.5">
          <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 dark:text-zinc-500 font-bold">
            Quarterly Roadmap — {selectedPeriod.label}
          </span>
          <span className="text-[11px] font-mono text-zinc-400">
            4 Weekly Milestone Cards per Month
          </span>
        </div>

        {/* 3 Columns Grid: Month 1 | Month 2 | Month 3 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {selectedPeriod.months.map((m) => {
            // Filter all enrollments for this specific month
            const monthEnrollments = initialEnrollments.filter((r) => {
              const d = new Date(r.rebookedAt);
              return d.getFullYear() === m.year && d.getMonth() === m.monthIdx;
            });

            const monthRevenue = monthEnrollments.length * offerPrice;

            return (
              /* MONTH HOUSING CARD (Matching Screenshot 2 Column Container "To do 3") */
              <div
                key={m.name}
                className="rounded-2xl bg-zinc-100/70 dark:bg-zinc-950/60 border border-zinc-200/80 dark:border-zinc-800/60 p-3 space-y-3"
              >
                {/* Column Header Pill (Matching Screenshot 2: "To do 3") */}
                <div className="flex items-center justify-between px-1 py-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                      {m.name}
                    </span>
                    <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-md bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                      {monthEnrollments.length}
                    </span>
                  </div>
                  <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    ${monthRevenue.toLocaleString()}
                  </span>
                </div>

                {/* ── 4 WEEKLY CARDS (Matching Screenshot 2: Task 1, Task 2, Task 3, Task 4) ── */}
                <div className="space-y-2.5">
                  {WEEKS_IN_MONTH.map((w) => {
                    // Filter deals for this exact week (e.g. Days 1-7)
                    const weekDeals = monthEnrollments.filter((r) => {
                      const day = new Date(r.rebookedAt).getDate();
                      return day >= w.dayStart && day <= w.dayEnd;
                    });

                    const weekRevenue = weekDeals.length * offerPrice;
                    const latestDeal = weekDeals[0] ?? null;
                    const initials = latestDeal ? getInitials(latestDeal.prospectName, latestDeal.prospectEmail) : "WB";

                    // Format date string for bottom right (e.g. "2 Jul" matching "2 Jun" in Screenshot 2)
                    const shortMonthName = m.name.split(" ")[0].slice(0, 3);
                    const weekDateTag = `${w.dayEnd} ${shortMonthName}`;

                    return (
                      /* WEEKLY RECTANGLE CARD (Matching Screenshot 2: White "Task 1" Card) */
                      <div
                        key={w.weekNum}
                        className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3.5 space-y-2.5 shadow-xs hover:border-zinc-300 dark:hover:border-zinc-700 transition-all group"
                      >
                        {/* Title Row with Check Icon (Matching Screenshot 2: "(✓) Task 1") */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {weekDeals.length > 0 ? (
                              <CheckCircle2 size={15} className="text-emerald-500 shrink-0 mt-0.5" />
                            ) : (
                              <div className="w-3.5 h-3.5 rounded-full border border-zinc-300 dark:border-zinc-700 shrink-0 mt-0.5" />
                            )}
                            <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                              {w.label} <span className="text-[10px] font-mono text-zinc-400 font-normal">({w.dayStart}-{w.dayEnd} {shortMonthName})</span>
                            </span>
                          </div>
                        </div>

                        {/* Priority / Performance Tag (Matching Screenshot 2: "Low" or "Medium" Tag) */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {weekDeals.length > 0 ? (
                            <>
                              <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                                {weekDeals.length} Recovered
                              </span>
                              {offerPrice > 0 && (
                                <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                                  +${weekRevenue.toLocaleString()}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                              No Recoveries
                            </span>
                          )}
                        </div>

                        {/* Deals / Telemetry Breakdown inside the Weekly Card */}
                        {weekDeals.length > 0 ? (
                          <div className="space-y-1 text-[11px] pt-0.5">
                            {weekDeals.map((d, dIdx) => (
                              <div key={d.prospectEmail + dIdx} className="text-zinc-700 dark:text-zinc-300 leading-snug flex items-center justify-between">
                                <span className="truncate max-w-[130px]" title={d.prospectEmail}>
                                  • {d.prospectName ?? d.prospectEmail}
                                </span>
                                <span className="text-[10px] font-mono text-zinc-400">
                                  {new Date(d.rebookedAt).getDate()} {shortMonthName}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[11px] text-zinc-400 dark:text-zinc-500 leading-snug">
                            Waiting for rebook triggers.
                          </p>
                        )}

                        {/* Avatar & Pink Date (Matching Screenshot 2: Pink "AD" Avatar + "2 Jun" Date) */}
                        <div className="flex items-center justify-between pt-1 border-t border-zinc-100 dark:border-zinc-800/60 text-xs">
                          <div className="flex items-center gap-2">
                            {/* Pink circle avatar matching Screenshot 2 "AD" */}
                            <div className="w-6 h-6 rounded-full bg-pink-100 dark:bg-pink-950/80 text-pink-700 dark:text-pink-300 text-[10px] font-bold flex items-center justify-center shrink-0">
                              {initials}
                            </div>
                            <span className="text-[11px] font-mono text-zinc-500 truncate max-w-[110px]">
                              {latestDeal ? latestDeal.prospectEmail : skillName("win-back")}
                            </span>
                          </div>

                          {/* Pink Date text matching "2 Jun" in Screenshot 2 */}
                          <span className="text-xs font-mono font-medium text-pink-600 dark:text-pink-400 shrink-0">
                            {weekDateTag}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}