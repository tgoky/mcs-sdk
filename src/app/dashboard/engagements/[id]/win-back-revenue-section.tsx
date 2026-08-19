"use client";

// src/app/dashboard/engagements/[id]/win-back-revenue-section.tsx

import React, { useState, useRef, useEffect, useMemo } from "react";
import { 
  DollarSign, 
  ChevronDown, 
  Check, 
  Calendar, 
  Mail, 
  ExternalLink,
  TrendingUp,
  UserCheck,
  Clock,
  Sparkles,
  ArrowUpRight
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

function getPeriodOptions(referenceDate: Date = new Date()): PeriodOption[] {
  const currentQuarterIdx = Math.floor(referenceDate.getMonth() / 3);
  const currentYear = referenceDate.getFullYear();

  const options: PeriodOption[] = [];
  for (let back = 0; back < 4; back++) {
    const absoluteQuarter = currentYear * 4 + currentQuarterIdx - back;
    const year = Math.floor(absoluteQuarter / 4);
    const quarterIdx = ((absoluteQuarter % 4) + 4) % 4;
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
    const endDate = new Date(year, startMonthIdx + 3, 0);
    const fmt = (d: Date) => `${monthNames[d.getMonth()].slice(0, 3)} ${d.getDate()}`;

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

export function WinBackRevenueSection({
  engagementId,
  offerPrice,
  initialEnrollments,
  initialPeriodLabel,
}: WinBackRevenueSectionProps) {
  const periods = useMemo(() => getPeriodOptions(), []);
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodOption>(periods[0]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState<RecoveredEnrollment | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const totalQuarterEnrollments = useMemo(() => {
    return initialEnrollments.filter((r) => {
      const d = new Date(r.rebookedAt);
      return selectedPeriod.months.some(
        (m) => d.getFullYear() === m.year && d.getMonth() === m.monthIdx
      );
    });
  }, [initialEnrollments, selectedPeriod]);

  const recoveredCount = totalQuarterEnrollments.length;
  const totalRevenue = recoveredCount * offerPrice;
  const averageRecoveryValue = recoveredCount > 0 ? totalRevenue / recoveredCount : offerPrice;

  return (
    <div className="space-y-4 font-sans text-zinc-900 dark:text-zinc-100">
      {/* ── HEADER WITH PERIOD SELECTOR ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-[#f8f7fa] dark:bg-zinc-950 p-3 shadow-xs">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 font-bold shrink-0">
            <DollarSign size={16} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white font-sans">
              Win-Back Revenue &amp; Recovery Performance
            </h3>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-sans">
              Direct financial attribution from prospects re-engaged by Win-Back.
            </p>
          </div>
        </div>

        {/* Period Selector Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <Calendar size={13} className="text-zinc-500" />
            <span>{selectedPeriod.label} ({selectedPeriod.sublabel})</span>
            <ChevronDown size={14} className="text-zinc-400 ml-1" />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 mt-1.5 w-72 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xl z-50 p-1.5 space-y-0.5 animate-in fade-in-50 zoom-in-95 duration-100 font-sans">
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
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2 rounded-xl text-left text-xs transition-colors cursor-pointer font-sans",
                      isSelected
                        ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white font-semibold"
                        : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={cn("w-4 h-4 rounded-full flex items-center justify-center shrink-0", isSelected ? "text-zinc-900 dark:text-white" : "opacity-0")}>
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

      {/* ── TOP METRICS CARDS ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-sans">
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-[#f8f7fa] dark:bg-zinc-950 p-4 space-y-1 shadow-sm">
          <span className="text-[10.5px] font-mono font-bold uppercase tracking-wider text-zinc-500 block">
            Attributed Revenue ({selectedPeriod.label})
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">
              ${totalRevenue.toLocaleString()}
            </span>
          </div>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-sans">
            Based on ${offerPrice.toLocaleString()} unit offer value.
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-[#f8f7fa] dark:bg-zinc-950 p-4 space-y-1 shadow-sm">
          <span className="text-[10.5px] font-mono font-bold uppercase tracking-wider text-zinc-500 block">
            Recovered Deals
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-zinc-900 dark:text-white font-mono tabular-nums">
              {recoveredCount}
            </span>
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 font-mono">
              Rebooked &amp; Retained
            </span>
          </div>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-sans">
            Prospects who rebooked via recovery outreach.
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-[#f8f7fa] dark:bg-zinc-950 p-4 space-y-1 shadow-sm">
          <span className="text-[10.5px] font-mono font-bold uppercase tracking-wider text-zinc-500 block">
            Avg Value per Recovery
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-zinc-900 dark:text-white font-mono tabular-nums">
              ${Math.round(averageRecoveryValue).toLocaleString()}
            </span>
          </div>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-sans">
            Contract value per rebooked meeting.
          </p>
        </div>
      </div>

      {/* ── 3-MONTH REVENUE BREAKDOWN ── */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-[#f8f7fa] dark:bg-zinc-950 p-4 space-y-3 shadow-xl font-sans">
        <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-2.5">
          <span className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider font-sans">
            Monthly Recovery Breakdown — {selectedPeriod.label}
          </span>
          <span className="text-xs font-mono text-zinc-500">
            {totalQuarterEnrollments.length} total recovered in period
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {selectedPeriod.months.map((m) => {
            const monthEnrollments = initialEnrollments.filter((r) => {
              const d = new Date(r.rebookedAt);
              return d.getFullYear() === m.year && d.getMonth() === m.monthIdx;
            });
            const monthRevenue = monthEnrollments.length * offerPrice;

            return (
              <div
                key={m.name}
                className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-3 space-y-2 shadow-xs"
              >
                <div className="flex items-center justify-between font-sans">
                  <span className="text-xs font-bold text-zinc-900 dark:text-white font-sans">{m.name}</span>
                  <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    ${monthRevenue.toLocaleString()}
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px] font-mono text-zinc-500">
                  <span>Deals Recovered</span>
                  <span className="font-bold text-zinc-900 dark:text-zinc-100">{monthEnrollments.length}</span>
                </div>

                {/* Visual Bar */}
                <div className="h-1.5 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                    style={{
                      width: monthEnrollments.length > 0
                        ? `${Math.min(100, (monthEnrollments.length / Math.max(1, recoveredCount)) * 100)}%`
                        : "0%",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── RECOVERED DEALS LEDGER TABLE ── */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-[#f8f7fa] dark:bg-zinc-950 overflow-hidden shadow-xl font-sans">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-100/80 dark:bg-zinc-900/60 font-sans">
          <div className="flex items-center gap-2">
            <UserCheck size={15} className="text-emerald-500" />
            <span className="text-xs font-bold text-zinc-900 dark:text-white font-sans">
              Recovered Prospect Roster ({totalQuarterEnrollments.length})
            </span>
          </div>
          <span className="text-[11px] font-mono text-zinc-500">
            Click any row to inspect run activity
          </span>
        </div>

        {totalQuarterEnrollments.length === 0 ? (
          <div className="py-12 text-center text-zinc-500 space-y-1.5 font-sans">
            <Clock size={22} className="mx-auto text-zinc-400 dark:text-zinc-600" />
            <p className="text-xs font-sans">No recovered deals logged for {selectedPeriod.label}.</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-200 dark:divide-zinc-800/60 font-sans">
            {totalQuarterEnrollments.map((deal, idx) => {
              const daysToRecover = Math.max(
                0,
                Math.round(
                  (new Date(deal.rebookedAt).getTime() - new Date(deal.enrolledAt).getTime()) /
                    (24 * 60 * 60 * 1000)
                )
              );

              return (
                <button
                  key={deal.prospectEmail + idx}
                  type="button"
                  onClick={() => setSelectedDeal(deal)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left bg-white dark:bg-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer font-sans border-0"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-950 dark:bg-emerald-950/80 dark:text-emerald-300 font-mono text-xs font-bold shrink-0">
                      ${offerPrice > 0 ? Math.round(offerPrice / 1000) + "k" : "✓"}
                    </span>

                    <div className="min-w-0 space-y-0.5">
                      <span className="truncate text-xs font-bold text-zinc-900 dark:text-white block font-sans">
                        {deal.prospectName ?? deal.prospectEmail}
                      </span>
                      <span className="text-[11px] text-zinc-500 font-mono block truncate">
                        {deal.prospectEmail}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 text-right font-sans">
                    <div className="hidden sm:block">
                      <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 font-mono block">
                        +${offerPrice.toLocaleString()}
                      </span>
                      <span className="text-[10px] font-mono text-zinc-500 block">
                        Recovered in {daysToRecover}d
                      </span>
                    </div>

                    <StatusPill tone="success">Rebooked</StatusPill>
                    <ArrowUpRight size={14} className="text-zinc-400" />
                  </div>
                </button>
              );
            })}
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
              <SheetTitle className="mt-2 text-lg font-bold font-sans text-zinc-900 dark:text-white">
                {deal.prospectName ?? deal.prospectEmail}
              </SheetTitle>
              <SheetDescription className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400 font-sans">
                Rebooked {new Date(deal.rebookedAt).toLocaleString(undefined, { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </SheetDescription>
            </SheetHeader>
            <SheetBody className="space-y-4 font-sans pt-2">
              <div className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300 font-sans">
                <Mail size={13} className="text-zinc-500 shrink-0" />
                <span className="truncate font-mono">{deal.prospectEmail}</span>
              </div>

              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 p-3 space-y-2 text-xs font-sans">
                {offerPrice > 0 && (
                  <div className="flex items-center justify-between font-sans">
                    <span className="text-zinc-600 dark:text-zinc-400 font-semibold">Revenue Attributed</span>
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">${offerPrice.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex items-center justify-between font-sans pt-1">
                  <span className="text-zinc-600 dark:text-zinc-400 font-semibold">Enrolled in Cadence</span>
                  <span className="font-mono text-zinc-900 dark:text-white">{new Date(deal.enrolledAt).toLocaleDateString(undefined, { month: "long", day: "numeric" })}</span>
                </div>
                <div className="flex items-center justify-between font-sans pt-1">
                  <span className="text-zinc-600 dark:text-zinc-400 font-semibold">Recovery Window</span>
                  <span className="font-mono text-zinc-900 dark:text-white">{deal.recoveryWindowDays} days</span>
                </div>
                <div className="flex items-center justify-between font-sans pt-1">
                  <span className="text-zinc-600 dark:text-zinc-400 font-semibold">Days to Recover</span>
                  <span className="font-mono text-zinc-900 dark:text-white">
                    {Math.max(0, Math.round((new Date(deal.rebookedAt).getTime() - new Date(deal.enrolledAt).getTime()) / (24 * 60 * 60 * 1000)))} days
                  </span>
                </div>
              </div>

              {deal.runId && (
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 text-zinc-900 dark:text-zinc-100 overflow-hidden text-xs font-sans">
                  <button
                    type="button"
                    onClick={() => setShowRunActivity((p) => !p)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-colors"
                  >
                    <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-300">
                      <SquishySkillBadge skill="win-back" size={14} enabled={true} />
                      Run Activity
                    </span>
                    <ChevronDown size={13} className={cn("text-zinc-500 transition-transform", showRunActivity && "rotate-180")} />
                  </button>

                  {showRunActivity && (
                    <div className="px-3 pb-3 pt-2 border-t border-zinc-200 dark:border-zinc-800/60 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 rounded-b-xl">
                      <RunActivityPanel runId={deal.runId} />
                      <a
                        href={`/dashboard/runs/${deal.runId}`}
                        className="mt-3 inline-flex items-center gap-1.5 text-[10.5px] text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors font-medium"
                      >
                        <span>Open full run page</span>
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