"use client";

// src/app/dashboard/runs/[id]/views/leak-map-trend-chart.tsx
//
// The "Trend" tab's chart — one metric's current value across every past
// audit for this engagement (weekly + monthly runs mixed, oldest to
// newest). Deliberately single-metric, single-axis: these metrics have
// different units (a % win-rate vs. a raw brief count), so a shared-axis
// multi-line chart would silently mislead — see dataviz skill's "one axis"
// rule. A metric picker + one line chart per selection is the small-
// multiples alternative without the visual clutter of rendering all of
// them at once.

import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  type TooltipContentProps,
} from "recharts";
import { TrendingUp, ChevronDown } from "lucide-react";
import { ActionMenu, ActionMenuItem } from "@/components/action-menu";
import type { TopIssue } from "../_shared/types";

type HistoryEntryLike = {
  id: string;
  createdAt: string;
  topIssues: TopIssue[];
};

function formatAxisDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatTooltipDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function ChartTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload as { fullDate: string; value: number | null; insufficientData?: boolean };
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2.5 py-1.5 text-xs shadow-elevation-2">
      <p className="font-mono text-zinc-500 dark:text-zinc-500 text-[10.5px]">{formatTooltipDate(point.fullDate)}</p>
      <p className="font-bold text-zinc-900 dark:text-white">
        {point.value === null ? "No data" : point.value}
        {point.insufficientData && <span className="ml-1 font-normal text-amber-600 dark:text-amber-400">(below floor)</span>}
      </p>
    </div>
  );
}

export function LeakMapTrendChart({ history }: { history: HistoryEntryLike[] }) {
  const metricNames = useMemo(() => {
    const seen = new Set<string>();
    const names: string[] = [];
    // Newest run first (history arrives sorted desc) so a metric this
    // engagement just started tracking still shows up near the top of the
    // picker instead of wherever it happened to first appear historically.
    for (const entry of history) {
      for (const issue of entry.topIssues) {
        if (!seen.has(issue.name)) {
          seen.add(issue.name);
          names.push(issue.name);
        }
      }
    }
    return names;
  }, [history]);

  const [selected, setSelected] = useState(metricNames[0] ?? null);
  const activeMetric = selected && metricNames.includes(selected) ? selected : metricNames[0] ?? null;

  const chartData = useMemo(() => {
    if (!activeMetric) return [];
    return [...history]
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map((entry) => {
        const issue = entry.topIssues.find((i) => i.name === activeMetric);
        return {
          fullDate: entry.createdAt,
          date: formatAxisDate(entry.createdAt),
          value: issue ? issue.current : null,
          insufficientData: issue?.insufficientData ?? false,
        };
      });
  }, [history, activeMetric]);

  const pointCount = chartData.filter((d) => d.value !== null).length;

  if (metricNames.length === 0 || pointCount < 2) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-zinc-400 dark:text-zinc-600">
        <TrendingUp size={22} />
        <p className="text-xs text-center max-w-xs">
          Not enough audits yet to chart a trend — need at least 2 runs with the same metric before a line means anything.
        </p>
      </div>
    );
  }

  const latest = chartData[chartData.length - 1];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ActionMenu
          align="start"
          panelWidth={240}
          trigger={({ toggle, open }) => (
            <button
              type="button"
              onClick={toggle}
              aria-expanded={open}
              className="hover-lift press-settle flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2.5 py-1.5 text-xs font-semibold text-zinc-900 dark:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <span className="truncate max-w-[160px]">{activeMetric}</span>
              <ChevronDown size={12} className="shrink-0 text-zinc-400" />
            </button>
          )}
        >
          {(closeMenu) => (
            <>
              {metricNames.map((name) => (
                <ActionMenuItem
                  key={name}
                  label={name}
                  active={name === activeMetric}
                  onClick={() => {
                    setSelected(name);
                    closeMenu();
                  }}
                />
              ))}
            </>
          )}
        </ActionMenu>
        {latest?.value !== null && (
          <p className="text-xs font-mono text-zinc-500 dark:text-zinc-500">
            Latest: <span className="font-bold text-zinc-900 dark:text-white">{latest.value}</span>
          </p>
        )}
      </div>

      <div style={{ width: "100%", height: 240 }}>
        <ResponsiveContainer>
          <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeWidth={1} />
            <XAxis
              dataKey="date"
              tick={{ fill: "var(--chart-axis)", fontSize: 11 }}
              axisLine={{ stroke: "var(--chart-grid)" }}
              tickLine={false}
            />
            <YAxis tick={{ fill: "var(--chart-axis)", fontSize: 11 }} axisLine={false} tickLine={false} width={36} />
            <Tooltip content={ChartTooltip} cursor={{ stroke: "var(--chart-grid)", strokeWidth: 1 }} />
            <Line
              dataKey="value"
              stroke="var(--chart-line-1)"
              strokeWidth={2}
              dot={{ r: 4, fill: "var(--chart-line-1)", stroke: "var(--chart-surface)", strokeWidth: 2 }}
              activeDot={{ r: 5, fill: "var(--chart-line-1)", stroke: "var(--chart-surface)", strokeWidth: 2 }}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
