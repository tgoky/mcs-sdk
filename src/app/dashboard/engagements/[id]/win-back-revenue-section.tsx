"use client";

import React, { useState, useRef, useEffect } from "react";
import { 
  DollarSign, 
  ChevronDown, 
  Check, 
  Calendar, 
  Mail,
  ExternalLink,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetBody, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { StatusPill } from "../../runs/[id]/_shared/status-pill";
import { RunActivityPanel } from "../../runs/[id]/_shared/run-activity-panel";
import { SquishySkillBadge } from "@/components/squishy-skill-badge";

export interface RecoveredEnrollment {
  prospectEmail: string;
  prospectName: string | null;
  rebookedAt: string;
  runId: string | null;
  recoveryWindowDays: number;
  enrolledAt: string;
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
  const [selectedDeal, setSelectedDeal] = useState<RecoveredEnrollment | null>(null);
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

  // 12 weekly buckets across the selected quarter, for the trend strip below.
  // Replaces a 3-column x 4-row kanban board that rendered 12 cards no
  // matter what — mostly "No Recoveries" placeholders whenever a client is
  // new or between recoveries. A bar strip + flat list carries the same
  // information without the empty scaffolding (2026-08-20 UX audit).
  const weeklyBuckets = selectedPeriod.months.flatMap((m) =>
    WEEKS_IN_MONTH.map((w) => {
      const count = totalQuarterEnrollments.filter((r) => {
        const d = new Date(r.rebookedAt);
        return d.getFullYear() === m.year && d.getMonth() === m.monthIdx && d.getDate() >= w.dayStart && d.getDate() <= w.dayEnd;
      }).length;
      return {
        key: `${m.year}-${m.monthIdx}-${w.weekNum}`,
        label: `${m.name.split(" ")[0]} ${w.label}`,
        shortLabel: m.monthIdx !== selectedPeriod.months[0].monthIdx || w.weekNum === 1 ? m.name.slice(0, 3) : "",
        count,
        revenue: count * offerPrice,
      };
    })
  );
  const maxWeekCount = Math.max(1, ...weeklyBuckets.map((w) => w.count));
  const sortedDeals = [...totalQuarterEnrollments].sort(
    (a, b) => new Date(b.rebookedAt).getTime() - new Date(a.rebookedAt).getTime()
  );

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
            <div className="absolute right-0 mt-1.5 w-72 rounded-2xl border border-border bg-white dark:bg-zinc-900 shadow-xl dark:shadow-2xl z-50 p-1.5 space-y-0.5 animate-in fade-in-50 zoom-in-95 duration-100">
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

      {/* ── Weekly Recovery Trend — a compact bar strip instead of a 12-card
           kanban board that rendered "No Recoveries" placeholders for every
           empty week. Same information, no empty scaffolding. ── */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/50 p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 dark:text-zinc-500 font-bold">
            Weekly Recovery Trend — {selectedPeriod.label}
          </span>
          {recoveredCount === 0 && (
            <span className="text-[11px] text-zinc-400 dark:text-zinc-500">No recoveries yet this period</span>
          )}
        </div>
        <div className="flex items-end gap-1.5 h-16">
          {weeklyBuckets.map((wk) => (
            <div key={wk.key} className="flex-1 flex flex-col items-center gap-1" title={`${wk.label}: ${wk.count} recovered${offerPrice > 0 ? `, $${wk.revenue.toLocaleString()}` : ""}`}>
              <div className="w-full h-12 rounded-t-sm bg-zinc-100 dark:bg-zinc-800 relative overflow-hidden flex items-end">
                {wk.count > 0 && (
                  <div
                    className="w-full bg-emerald-500 dark:bg-emerald-400 rounded-t-sm transition-all"
                    style={{ height: `${Math.max(12, (wk.count / maxWeekCount) * 100)}%` }}
                  />
                )}
              </div>
              <span className="text-[9px] font-mono text-zinc-400 h-3">{wk.shortLabel}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Recovered Deals — flat chronological list. Only real rows,
           one honest empty state instead of stacked per-week placeholders. ── */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/50 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-100 dark:border-zinc-800/80">
          <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 dark:text-zinc-500 font-bold">
            Recovered Deals — {selectedPeriod.label}
          </span>
          <span className="text-[11px] font-mono text-zinc-400">{sortedDeals.length} total</span>
        </div>

        {sortedDeals.length === 0 ? (
          <div className="flex flex-col items-center gap-1 py-10 px-6 text-center">
            <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">No recoveries yet in {selectedPeriod.label}</p>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 max-w-xs">
              A deal shows up here the moment a prospect enrolled in the recovery cadence rebooks their call.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60 max-h-96 overflow-y-auto">
            {sortedDeals.map((d, idx) => (
              <button
                key={d.prospectEmail + idx}
                type="button"
                onClick={() => setSelectedDeal(d)}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition-colors cursor-pointer"
              >
                <div className="w-7 h-7 rounded-full bg-pink-100 dark:bg-pink-950/80 text-pink-700 dark:text-pink-300 text-[10px] font-bold flex items-center justify-center shrink-0">
                  {getInitials(d.prospectName, d.prospectEmail)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">{d.prospectName ?? d.prospectEmail}</p>
                  <p className="text-[10.5px] text-zinc-400 font-mono truncate">{d.prospectEmail}</p>
                </div>
                {offerPrice > 0 && (
                  <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
                    +${offerPrice.toLocaleString()}
                  </span>
                )}
                <span className="text-[10.5px] font-mono text-zinc-400 shrink-0 w-14 text-right">
                  {new Date(d.rebookedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <RecoveredDealDrawer deal={selectedDeal} offerPrice={offerPrice} onClose={() => setSelectedDeal(null)} />
    </div>
  );
}

function RecoveredDealDrawer({
  deal,
  offerPrice,
  onClose,
}: {
  deal: RecoveredEnrollment | null;
  offerPrice: number;
  onClose: () => void;
}) {
  const [showRunActivity, setShowRunActivity] = useState(false);

  useEffect(() => {
    setShowRunActivity(false);
  }, [deal?.prospectEmail, deal?.rebookedAt]);

  return (
    <Sheet open={!!deal} onOpenChange={(open) => !open && onClose()}>
      <SheetContent widthClassName="w-full sm:max-w-md font-sans antialiased text-zinc-900 dark:text-zinc-100">
        {deal && (
          <>
            <SheetHeader className="font-sans">
              <StatusPill tone="success" className="w-fit">Recovered</StatusPill>
              <SheetTitle className="mt-2 text-lg font-bold font-sans text-zinc-900 dark:text-white">{deal.prospectName ?? deal.prospectEmail}</SheetTitle>
              <SheetDescription className="flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-400 font-sans">
                Rebooked {new Date(deal.rebookedAt).toLocaleString(undefined, { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </SheetDescription>
            </SheetHeader>
            <SheetBody className="space-y-4 font-sans pt-2">
              <div className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300 font-sans">
                <Mail size={13} className="text-zinc-500 dark:text-zinc-500 shrink-0" />
                <span className="truncate">{deal.prospectEmail}</span>
              </div>

              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 p-3 space-y-2">
                {offerPrice > 0 && (
                  <div className="flex items-center justify-between text-xs font-sans">
                    <span className="text-zinc-600 dark:text-zinc-400">Revenue attributed</span>
                    <span className="font-mono font-bold text-emerald-400">${offerPrice.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-xs font-sans pt-1">
                  <span className="text-zinc-600 dark:text-zinc-400">Enrolled in cadence</span>
                  <span className="font-mono text-zinc-900 dark:text-white">{new Date(deal.enrolledAt).toLocaleDateString(undefined, { month: "long", day: "numeric" })}</span>
                </div>
                <div className="flex items-center justify-between text-xs font-sans pt-1">
                  <span className="text-zinc-600 dark:text-zinc-400">Recovery window</span>
                  <span className="font-mono text-zinc-900 dark:text-white">{deal.recoveryWindowDays} days</span>
                </div>
                <div className="flex items-center justify-between text-xs font-sans pt-1">
                  <span className="text-zinc-600 dark:text-zinc-400">Days to recover</span>
                  <span className="font-mono text-zinc-900 dark:text-white">
                    {Math.max(0, Math.round((new Date(deal.rebookedAt).getTime() - new Date(deal.enrolledAt).getTime()) / (24 * 60 * 60 * 1000)))} days
                  </span>
                </div>
              </div>

              {deal.runId && (
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowRunActivity((p) => !p)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left cursor-pointer hover:bg-white dark:hover:bg-zinc-900 transition-colors"
                  >
                    <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                      <SquishySkillBadge skill="win-back" size={14} enabled={true} />
                      Run activity
                    </span>
                    <ChevronDown size={13} className={`text-zinc-500 dark:text-zinc-500 transition-transform ${showRunActivity ? "rotate-180" : ""}`} />
                  </button>
                  {showRunActivity && (
                    <div className="px-3 pb-3 pt-1 border-t border-zinc-200/60 dark:border-zinc-800/60">
                      <RunActivityPanel runId={deal.runId} />
                      <a
                        href={`/dashboard/runs/${deal.runId}`}
                        className="mt-3 inline-flex items-center gap-1.5 text-[10.5px] text-zinc-500 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
                      >
                        <span>Open the full run page</span>
                        <ExternalLink size={10} />
                      </a>
                    </div>
                  )}
                </div>
              )}
            </SheetBody>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}