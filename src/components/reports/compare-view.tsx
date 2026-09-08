"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";

interface ComparisonPoint {
  weekStart: string;
  value: number | null;
  displayValue: string;
  isCurrentWeek: boolean;
}

interface ComparisonSeries {
  workerId: string;
  workerName: string;
  label: string;
  points: ComparisonPoint[];
}

function seriesKey(s: ComparisonSeries): string {
  return `${s.workerId}:${s.label}`;
}

/** Self-scaled sparkline — each series is normalized to its own min/max,
 * never a shared axis across series with different units (a rate and a
 * raw count plotted on one axis would just be misleading). */
function Sparkline({ points }: { points: ComparisonPoint[] }) {
  const numeric = points.filter((p): p is ComparisonPoint & { value: number } => p.value !== null);
  if (numeric.length < 2) {
    return <span className="text-xs" style={{ color: "var(--text-muted)" }}>Not enough weeks yet</span>;
  }

  const W = 160;
  const H = 32;
  const pad = 3;
  const values = numeric.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = (W - pad * 2) / (numeric.length - 1);

  const coords = numeric.map((p, i) => {
    const x = pad + i * step;
    const y = H - pad - ((p.value - min) / range) * (H - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: W, height: H }} role="img" aria-label="Trend over time">
      <polyline points={coords.join(" ")} fill="none" stroke="var(--text-primary)" strokeWidth={1.5} />
      {numeric.map((p, i) => (
        <circle
          key={i}
          cx={coords[i].split(",")[0]}
          cy={coords[i].split(",")[1]}
          r={p.isCurrentWeek ? 2.5 : 1.5}
          fill="var(--text-primary)"
        />
      ))}
    </svg>
  );
}

/**
 * Analytics/Reports' Compare feature — pick any set of worker metrics and
 * see each one's own trend over the last several weeks, self-scaled per
 * series. Backed entirely by client_metric_snapshots (compare-service.ts)
 * — no per-worker code here, ever; a new worker's line appears the
 * moment its own resolver starts contributing snapshot values.
 */
export function CompareView({ engagementId }: { engagementId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [series, setSeries] = useState<ComparisonSeries[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    if (!expanded || fetched) return;
    setLoading(true);
    fetch(`/api/engagements/${engagementId}/compare-series?weeks=8`)
      .then((res) => (res.ok ? res.json() : { series: [] }))
      .then((data: { series: ComparisonSeries[] }) => {
        const list = data.series ?? [];
        setSeries(list);
        setSelectedKeys(new Set(list.map(seriesKey)));
        setFetched(true);
      })
      .catch(() => setFetched(true))
      .finally(() => setLoading(false));
  }, [expanded, fetched, engagementId]);

  const visibleSeries = useMemo(() => series.filter((s) => selectedKeys.has(seriesKey(s))), [series, selectedKeys]);

  function toggle(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="pt-2">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer transition-colors"
        style={{ color: "var(--text-muted)" }}
      >
        {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        Compare across time
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          {loading ? (
            <div className="flex items-center gap-2 text-xs py-4" style={{ color: "var(--text-muted)" }}>
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading history…
            </div>
          ) : series.length === 0 ? (
            <p className="text-xs py-2" style={{ color: "var(--text-muted)" }}>
              Not enough weekly history yet to compare — this fills in as more weeks pass.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5">
                {series.map((s) => {
                  const key = seriesKey(s);
                  const active = selectedKeys.has(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggle(key)}
                      className="px-2 py-1 rounded-md text-[11px] font-mono border transition-colors cursor-pointer"
                      style={
                        active
                          ? { borderColor: "var(--text-primary)", color: "var(--text-primary)" }
                          : { borderColor: "var(--border)", color: "var(--text-muted)" }
                      }
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>

              <div className="divide-y divide-zinc-200 dark:divide-zinc-800/80">
                {visibleSeries.map((s) => {
                  const latest = s.points[s.points.length - 1];
                  return (
                    <div key={seriesKey(s)} className="flex items-center justify-between gap-4 py-2.5">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                          {s.label}
                        </p>
                        <p className="text-[10px] font-mono" style={{ color: "var(--text-muted)" }}>
                          {s.workerName} · {s.points.length} week{s.points.length !== 1 ? "s" : ""}
                        </p>
                      </div>
                      <Sparkline points={s.points} />
                      <span className="text-xs font-mono shrink-0" style={{ color: "var(--text-primary)" }}>
                        {latest?.displayValue ?? "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
