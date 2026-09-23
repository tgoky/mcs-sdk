"use client";

// Each worker's real state for this client — ready, needs setup (with what's
// missing), or off — from GET /api/engagements/[id]/worker-status. Replaces
// the dossiers' hard-coded "7/7 Active" / "15/15 Active" headers, which were
// typed-in text and said nothing about the skills blocked by missing fields.

import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, CircleOff, Loader2 } from "lucide-react";
import { AnySkillBadge } from "@/components/any-skill-badge";
import type { ProductId } from "@/lib/product-catalog";

interface WorkerStatus {
  workerId: string;
  name: string;
  enabled: boolean;
  status: "ready" | "needs_setup" | "off";
  missing: { key: string; label: string; reason: string }[];
}

export function WorkerStatusGrid({
  engagementId,
  productId,
  refreshKey = 0,
  title = "Workers for this client",
}: {
  engagementId: string;
  productId: ProductId;
  /** Bump after a save so the grid re-reads what's now missing. */
  refreshKey?: number;
  title?: string;
}) {
  const [workers, setWorkers] = useState<WorkerStatus[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/engagements/${engagementId}/worker-status?product=${productId}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data) => {
        if (cancelled) return;
        setWorkers(data.workers ?? []);
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [engagementId, productId, refreshKey]);

  const ready = workers?.filter((w) => w.status === "ready").length ?? 0;
  const needsSetup = workers?.filter((w) => w.status === "needs_setup").length ?? 0;

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-300">{title}</span>
        {workers && (
          <span className="text-[10px] text-zinc-400 font-mono">
            {ready} of {workers.length} ready{needsSetup > 0 ? ` · ${needsSetup} need setup` : ""}
          </span>
        )}
      </div>

      {failed && <p className="text-xs text-zinc-500">Couldn&apos;t load worker status.</p>}
      {!workers && !failed && (
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking each worker…
        </div>
      )}

      {workers && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {workers.map((w) => (
            <div key={w.workerId} className="rounded-lg border border-zinc-800 bg-zinc-950/80 px-3 py-2 text-xs space-y-1">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 truncate">
                  <AnySkillBadge skill={w.workerId} size={20} />
                  <span className="font-medium text-zinc-200 truncate">{w.name}</span>
                </div>
                {w.status === "ready" && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 shrink-0">
                    <CheckCircle2 className="h-3 w-3" /> Ready
                  </span>
                )}
                {w.status === "needs_setup" && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-400 shrink-0">
                    <AlertTriangle className="h-3 w-3" /> Needs setup
                  </span>
                )}
                {w.status === "off" && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-zinc-500 shrink-0">
                    <CircleOff className="h-3 w-3" /> Off
                  </span>
                )}
              </div>
              {w.status === "needs_setup" && (
                <p className="text-[10.5px] text-zinc-500">Missing: {w.missing.map((m) => m.label).join(", ")}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
