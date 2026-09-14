"use client";

// Run History's filtering used to be server-rendered Links reading
// activeMonth/activeSkill/activeDate off the URL's searchParams — every
// click was a real navigation, round-tripping through the server to
// re-render with the new filter. Reported as "the arrows don't move
// anything" — moved entirely to client state instead: `runs` (this
// engagement's whole history, already fetched with no limit server-
// side) comes down once as a prop, and every filter (month, day, skill)
// is pure client-side useMemo work from here on. No ambiguity about
// caching, no server round-trip latency between a click and the table
// updating — the click IS the update.

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ArrowRight, CheckCircle2, XCircle, Loader2, AlertCircle, Calendar } from "lucide-react";
import { AnySkillBadge } from "@/components/any-skill-badge";
import { anySkillDisplayName } from "@/lib/any-skill";
import { phaseLabel, runStatusLabel, runStatusColor } from "@/lib/copy";
import { RunRowActions } from "./run-row-actions";

interface RunRow {
  id: string;
  skillName: string;
  status: string;
  phase: string | null;
  errorMessage: string | null;
  startedAt: string | Date;
  completedAt: string | Date | null;
  stepCount: number;
  subjectLabel: string | null;
}

function RunStatusIcon({ status }: { status: string }) {
  const s = status.toLowerCase();
  if (s === "success" || s === "completed") return <CheckCircle2 className="w-4 h-4 text-status-success shrink-0" />;
  if (s === "failed" || s === "error") return <XCircle className="w-4 h-4 text-status-error shrink-0" />;
  if (s === "running" || s === "in_progress") return <Loader2 className="w-4 h-4 text-zinc-400 dark:text-zinc-500 animate-spin shrink-0" />;
  return <AlertCircle className="w-4 h-4 text-zinc-400 dark:text-zinc-600 shrink-0" />;
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(minutes / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function monthKey(startedAt: RunRow["startedAt"]): string {
  const d = new Date(startedAt);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function dateKey(startedAt: RunRow["startedAt"]): string {
  const d = new Date(startedAt);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}
function dateLabel(key: string): string {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
function todayKey(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const chipBase = "px-2.5 py-1 rounded-md text-[11px] font-mono border transition-colors inline-flex items-center gap-1.5 select-none cursor-pointer";
const chipActive = "bg-zinc-900 dark:bg-zinc-100 text-zinc-50 dark:text-zinc-900 border-zinc-900 dark:border-zinc-100";
const chipInactive = "bg-transparent border-border text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800";

export function RunHistoryPanel({ engagementId, runs }: { engagementId: string; runs: RunRow[] }) {
  const [skill, setSkill] = useState<string | null>(null);
  const [month, setMonth] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);

  const skillsWithRuns = useMemo(() => {
    const seen = new Map<string, number>();
    for (const r of runs) seen.set(r.skillName, (seen.get(r.skillName) ?? 0) + 1);
    return Array.from(seen.entries());
  }, [runs]);

  const availableMonths = useMemo(
    () => Array.from(new Set(runs.map((r) => monthKey(r.startedAt)))).sort((a, b) => (a < b ? 1 : -1)),
    [runs]
  );
  const activeMonthIndex = month ? availableMonths.indexOf(month) : -1;
  const prevMonth = activeMonthIndex !== -1 && activeMonthIndex < availableMonths.length - 1 ? availableMonths[activeMonthIndex + 1] : null;
  const nextMonth = activeMonthIndex > 0 ? availableMonths[activeMonthIndex - 1] : null;

  function pickDate(next: string | null) {
    setDate(next);
    if (next) setMonth(null); // a specific day is strictly more precise
  }
  function pickMonth(next: string | null) {
    setMonth(next);
    setDate(null);
  }
  function resetToAllTime() {
    setMonth(null);
    setDate(null);
  }

  const filteredRuns = useMemo(() => {
    let list = skill ? runs.filter((r) => r.skillName === skill) : runs;
    if (date) list = list.filter((r) => dateKey(r.startedAt) === date);
    else if (month) list = list.filter((r) => monthKey(r.startedAt) === month);
    return list;
  }, [runs, skill, month, date]);

  const todayStr = todayKey(0);
  const yesterdayStr = todayKey(1);

  return (
    <div className="space-y-3" id="run-history">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider font-mono">Run History</h2>

        {availableMonths.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Quick jumps — explicit, tactile buttons instead of only a
                native date picker (which reads as "generic browser UI"
                and isn't obviously interactive at a glance). */}
            <button
              type="button"
              onClick={() => pickDate(date === todayStr ? null : todayStr)}
              className={`${chipBase} ${date === todayStr ? chipActive : chipInactive}`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => pickDate(date === yesterdayStr ? null : yesterdayStr)}
              className={`${chipBase} ${date === yesterdayStr ? chipActive : chipInactive}`}
            >
              Yesterday
            </button>

            <div className="flex items-center gap-1 ml-1">
              <button
                type="button"
                onClick={() => prevMonth && pickMonth(prevMonth)}
                disabled={!prevMonth}
                title="Earlier month with activity"
                className={`flex items-center justify-center w-6 h-6 rounded-md border border-zinc-200 dark:border-zinc-800 transition-colors cursor-pointer ${
                  prevMonth ? "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800" : "text-zinc-300 dark:text-zinc-700 pointer-events-none"
                }`}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={resetToAllTime}
                title={date || month ? "Back to all time" : undefined}
                className="text-[11px] font-mono font-semibold text-zinc-600 dark:text-zinc-300 min-w-[110px] text-center cursor-pointer hover:text-zinc-900 dark:hover:text-white transition-colors"
              >
                {date ? dateLabel(date) : month ? monthLabel(month) : "All time"}
              </button>
              <button
                type="button"
                onClick={() => nextMonth && pickMonth(nextMonth)}
                disabled={!nextMonth}
                title="More recent month with activity"
                className={`flex items-center justify-center w-6 h-6 rounded-md border border-zinc-200 dark:border-zinc-800 transition-colors cursor-pointer ${
                  nextMonth ? "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800" : "text-zinc-300 dark:text-zinc-700 pointer-events-none"
                }`}
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <label
              className="flex items-center gap-1.5 h-6 px-2 rounded-md border border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              title="Jump to a specific date"
            >
              <Calendar className="w-3 h-3 shrink-0" />
              <input
                type="date"
                value={date ?? ""}
                onChange={(e) => pickDate(e.target.value || null)}
                className="bg-transparent text-[11px] font-mono cursor-pointer outline-none [color-scheme:light] dark:[color-scheme:dark]"
              />
            </label>

            {(month || date) && (
              <button type="button" onClick={resetToAllTime} className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 underline underline-offset-2 transition-colors cursor-pointer">
                All time
              </button>
            )}
          </div>
        )}

        {filteredRuns.length > 20 && (
          <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500">Showing 20 of {filteredRuns.length}</span>
        )}
      </div>

      {skillsWithRuns.length > 1 && (
        <div className="flex items-center gap-1.5 flex-wrap" role="tablist" aria-label="Filter runs by module">
          <button type="button" onClick={() => setSkill(null)} role="tab" aria-selected={!skill} className={`${chipBase} ${!skill ? chipActive : chipInactive}`}>
            All
            <span className={`${!skill ? "opacity-70" : "opacity-50"} ml-0.5`}>{runs.length}</span>
          </button>
          {skillsWithRuns.map(([s, count]) => (
            <button
              key={s}
              type="button"
              onClick={() => setSkill(skill === s ? null : s)}
              role="tab"
              aria-selected={skill === s}
              className={`${chipBase} ${skill === s ? chipActive : chipInactive}`}
            >
              <AnySkillBadge skill={s} size={14} enabled={true} />
              {anySkillDisplayName(s)}
              <span className={`${skill === s ? "opacity-70" : "opacity-50"} ml-0.5`}>{count}</span>
            </button>
          ))}
        </div>
      )}

      {filteredRuns.length > 0 ? (
        <div className="w-full overflow-hidden bg-transparent border border-zinc-200/60 dark:border-zinc-800/60 rounded-xl transition-colors motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150">
          <ol className="divide-y divide-zinc-200 dark:divide-zinc-800/50">
            {filteredRuns.slice(0, 20).map((run) => {
              const isFailed = run.status.toLowerCase() === "failed";
              return (
                <li key={run.id} className="group relative">
                  <Link href={`/dashboard/runs/${run.id}`} className="absolute inset-0 z-10" aria-label={`View run details for ${anySkillDisplayName(run.skillName)}`} />
                  <div className="relative flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors">
                    <RunStatusIcon status={run.status} />
                    <div className="min-w-0 flex-1 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[13px] font-semibold text-zinc-800 dark:text-zinc-200">{anySkillDisplayName(run.skillName)}</span>
                          <span className={`text-xs font-normal font-mono ${runStatusColor(run.status)}`}>{runStatusLabel(run.status)}</span>
                        </div>
                        <div className="text-[11px] font-mono mt-0.5 text-zinc-400 dark:text-zinc-500">
                          {phaseLabel(run.phase)}
                          {run.stepCount > 0 ? ` · ${run.stepCount} step${run.stepCount === 1 ? "" : "s"}` : ""}
                        </div>
                        {isFailed && run.errorMessage ? (
                          <div className="text-[11px] font-mono text-rose-500/90 dark:text-rose-400/80 mt-1 leading-relaxed line-clamp-2 max-w-xl">{run.errorMessage}</div>
                        ) : run.subjectLabel ? (
                          <div className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed truncate max-w-xl" title={run.subjectLabel}>
                            {run.subjectLabel}
                          </div>
                        ) : null}
                      </div>
                      <div className="shrink-0 flex items-center gap-2 text-[11px] font-mono text-zinc-400 dark:text-zinc-500 pt-0.5" title={new Date(run.startedAt).toLocaleString()}>
                        <AnySkillBadge skill={run.skillName} size={22} enabled={true} />
                        <span>{relativeTime(String(run.startedAt))}</span>
                        <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                        <RunRowActions runId={run.id} engagementId={engagementId} skillName={run.skillName} skillLabel={anySkillDisplayName(run.skillName)} status={run.status} />
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      ) : (
        <div className="h-28 border border-dashed border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-transparent rounded-xl flex flex-col items-center justify-center space-y-1 transition-colors motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150">
          <p className="text-sm font-normal text-zinc-400 dark:text-zinc-500 text-center px-4">
            No{skill ? (
              <>
                {" "}
                <span className="font-medium text-zinc-500 dark:text-zinc-400">{anySkillDisplayName(skill)}</span>
              </>
            ) : (
              ""
            )}{" "}
            runs{date ? ` on ${dateLabel(date)}` : month ? ` in ${monthLabel(month)}` : " yet"}.
          </p>
          <div className="flex items-center gap-3">
            {(month || date) && (
              <button type="button" onClick={resetToAllTime} className="text-xs text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 underline underline-offset-2 transition-colors cursor-pointer">
                Clear date filter
              </button>
            )}
            {skill && (
              <button type="button" onClick={() => setSkill(null)} className="text-xs text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 underline underline-offset-2 transition-colors cursor-pointer">
                Clear module filter
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
