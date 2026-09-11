"use client";

// Replaces a table rendering every skill across every installed product
// at once — real value once there are more than a handful of skills, but
// mostly just a long scroll. The user picks which two to actually look
// at side by side, same as any real "compare" UI — nothing renders that
// wasn't asked for.

import { useState } from "react";
import { Dropdown } from "@/components/ui/dropdown";

export interface SkillStat {
  id: string;
  name: string;
  productLabel: string;
  total: number;
  resolved: number;
  rate: number | null;
  volumeSharePct: number;
  avgCostCents: number;
  avgDurationMs: number | null;
}

function fmtCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function fmtDuration(ms: number): string {
  const mins = ms / 60000;
  if (mins < 60) return `${Math.max(1, Math.round(mins))}m`;
  const hours = mins / 60;
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

function Bar({ value, max, className }: { value: number; max: number; className: string }) {
  const pctVal = max > 0 ? Math.max((value / max) * 100, value > 0 ? 2 : 0) : 0;
  return (
    <div className="h-1.5 w-full rounded-full bg-zinc-100 dark:bg-zinc-900 overflow-hidden">
      <div className={`h-full rounded-full ${className}`} style={{ width: `${pctVal}%` }} />
    </div>
  );
}

function SkillPicker({
  label,
  skills,
  value,
  onChange,
}: {
  label: string;
  skills: SkillStat[];
  value: string;
  onChange: (id: string) => void;
}) {
  const items = skills.map((s) => ({ key: s.id, label: `${s.name} (${s.productLabel})` }));
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="font-mono uppercase tracking-wider text-zinc-400 dark:text-zinc-600 shrink-0">{label}</span>
      <Dropdown
        items={items}
        selectedKey={value}
        onSelect={onChange}
        placeholder="Select skill…"
        triggerClassName="min-w-0 flex-1 sm:flex-initial bg-white dark:bg-zinc-900 border border-border px-2.5 py-1.5 text-sm text-zinc-900 dark:text-white hover:bg-white dark:hover:bg-zinc-900"
        panelClassName="bg-white dark:bg-zinc-900 border border-border"
      />
    </div>
  );
}

function SkillStatBlock({ stat, maxTotal }: { stat: SkillStat; maxTotal: number }) {
  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-1.5">
        <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{stat.name}</span>
        <span className="text-[9.5px] font-mono uppercase text-zinc-400 dark:text-zinc-600">{stat.productLabel}</span>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between text-[10.5px] font-mono text-zinc-400 dark:text-zinc-600">
          <span>Volume share</span>
          <span>
            {stat.total} run{stat.total !== 1 ? "s" : ""} ({stat.volumeSharePct}%)
          </span>
        </div>
        <Bar value={stat.total} max={maxTotal} className="bg-ink" />
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between text-[10.5px] font-mono text-zinc-400 dark:text-zinc-600">
          <span>Success rate</span>
          <span>{stat.resolved > 0 ? `${stat.rate}% of ${stat.resolved}` : "no resolved runs"}</span>
        </div>
        {stat.resolved > 0 && (
          <Bar
            value={stat.rate !== null ? (stat.rate / 100) * stat.resolved : 0}
            max={stat.resolved}
            className={stat.rate !== null && stat.rate < 100 ? "bg-rose-500" : "bg-emerald-500"}
          />
        )}
      </div>

      <div className="flex items-center justify-between text-xs">
        <span className="text-zinc-500 dark:text-zinc-500">Avg cost</span>
        <span className="font-mono text-zinc-700 dark:text-zinc-300">{stat.total > 0 ? fmtCents(stat.avgCostCents) : "—"}</span>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-zinc-500 dark:text-zinc-500">Avg duration</span>
        <span className="font-mono text-zinc-700 dark:text-zinc-300">{stat.avgDurationMs !== null ? fmtDuration(stat.avgDurationMs) : "—"}</span>
      </div>
    </div>
  );
}

export function SkillComparisonSection({ skills }: { skills: SkillStat[] }) {
  const sorted = [...skills].sort((a, b) => b.total - a.total);
  const [aId, setAId] = useState(sorted[0]?.id ?? "");
  const [bId, setBId] = useState(sorted[1]?.id ?? sorted[0]?.id ?? "");

  if (sorted.length === 0) return null;

  const a = skills.find((s) => s.id === aId) ?? sorted[0];
  const b = skills.find((s) => s.id === bId) ?? sorted[0];
  const maxTotal = Math.max(1, ...skills.map((s) => s.total));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <SkillPicker label="Compare" skills={sorted} value={a.id} onChange={setAId} />
        <span className="text-xs text-zinc-400 dark:text-zinc-600">vs</span>
        <SkillPicker label="With" skills={sorted} value={b.id} onChange={setBId} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 divide-y sm:divide-y-0 sm:divide-x divide-zinc-200 dark:divide-zinc-900">
        <div className="pb-4 sm:pb-0">
          <SkillStatBlock stat={a} maxTotal={maxTotal} />
        </div>
        <div className="sm:pl-8">
          <SkillStatBlock stat={b} maxTotal={maxTotal} />
        </div>
      </div>
    </div>
  );
}
