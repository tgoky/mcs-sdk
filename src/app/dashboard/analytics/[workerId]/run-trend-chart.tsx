"use client";

// The rebuilt analytics page's real trend chart — replaces the old
// page's single static "Runs (last 30d)" number with an actual day-by-
// day line. Per-skill outcome buckets (Show rate, Win-Back recovery, ...)
// don't exist as a day-by-day query anywhere in this codebase yet (see
// getWorkerRunTrend's own header), so this charts skillRuns itself: run
// volume (left axis, bars) and success rate (right axis, line) — both
// genuinely real, not fabricated, even for a worker with no outcome
// resolver at all.

import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface TrendPoint {
  date: string;
  runs: number;
  successRate: number | null;
}

function formatAxisDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

export function RunTrendChart({ data }: { data: TrendPoint[] }) {
  const chartData = data.map((d) => ({ ...d, label: formatAxisDate(d.date) }));
  const hasAnyRuns = data.some((d) => d.runs > 0);

  if (!hasAnyRuns) {
    return (
      <div className="flex flex-col items-center justify-center gap-1.5 h-48 text-zinc-400 dark:text-zinc-600">
        <p className="text-xs">No runs in the last 30 days to chart yet.</p>
      </div>
    );
  }

  return (
    <div className="h-56 -mx-1">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-zinc-200 dark:text-zinc-800" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fontFamily: "var(--font-sans)" }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={24}
          />
          <YAxis
            yAxisId="runs"
            tick={{ fontSize: 10, fontFamily: "var(--font-sans)" }}
            tickLine={false}
            axisLine={false}
            width={26}
            allowDecimals={false}
          />
          <YAxis
            yAxisId="rate"
            orientation="right"
            domain={[0, 100]}
            tick={{ fontSize: 10, fontFamily: "var(--font-sans)" }}
            tickLine={false}
            axisLine={false}
            width={32}
            tickFormatter={(v: number) => `${v}%`}
          />
          <Tooltip
            contentStyle={{ fontFamily: "var(--font-sans)", fontSize: 11, borderRadius: 8 }}
            formatter={(value, key) => [
              key === "successRate" ? (value == null ? "—" : `${value}%`) : String(value ?? "—"),
              key === "successRate" ? "Success rate" : "Runs",
            ]}
          />
          <Bar yAxisId="runs" dataKey="runs" fill="#f59e0b" radius={[3, 3, 0, 0]} maxBarSize={14} />
          <Line yAxisId="rate" dataKey="successRate" stroke="#6366f1" strokeWidth={2} dot={false} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
