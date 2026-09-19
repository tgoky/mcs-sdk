"use client";

// Phase 3's first real slice (see the "Worker Onboarding & Gating: Plan"
// doc): the Live Capability Matrix — a checklist of a worker's real
// capabilities that lights up as its dependent fields get filled in,
// driven entirely by worker-registry.ts's WORKER_CAPABILITIES data
// (Phase 2) and worker-capability-status.ts's live field reads.
// Deliberately read-only and additive: this renders next to an existing
// config form (icp-lock-config-form.tsx today), never replaces one — the
// save/submit flow this app already relies on is untouched.
//
// Only renders anything for the 5 Phase 2 workers with real capability
// data; for every other worker the API returns an empty capabilities
// array and this component renders null rather than showing a
// misleading empty checklist.

import { useEffect, useState } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import type { WorkerId } from "@/lib/worker-registry";

interface CapabilityStatus {
  name: string;
  active: boolean;
  missingFieldKeys: string[];
}

export function WorkerCapabilityMatrix({ workerId, engagementId }: { workerId: WorkerId; engagementId: string }) {
  const [capabilities, setCapabilities] = useState<CapabilityStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/engagements/${engagementId}/workers/${workerId}/capabilities`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load capabilities");
        if (!cancelled) setCapabilities(data.capabilities ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load capabilities");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workerId, engagementId]);

  // Silent, not an error state shown to the user — most workers genuinely
  // have no capability data yet (only the 5 Phase 2 workers do), and that
  // is a correct, expected state, not a failure.
  if (error || !capabilities || capabilities.length === 0) return null;

  const activeCount = capabilities.filter((c) => c.active).length;

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-600">Capabilities</h3>
        <span className="text-[10px] font-mono text-zinc-500 dark:text-zinc-500">
          {activeCount}/{capabilities.length} active
        </span>
      </div>
      <div className="space-y-1.5">
        {capabilities.map((cap) => (
          <div key={cap.name} className="flex items-start gap-2">
            {cap.active ? (
              <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <Circle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-zinc-300 dark:text-zinc-700" />
            )}
            <div className="min-w-0">
              <p className={`text-xs font-semibold ${cap.active ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-400 dark:text-zinc-600"}`}>{cap.name}</p>
              {!cap.active && (
                <p className="text-[10.5px] text-zinc-400 dark:text-zinc-600 leading-snug">
                  Needs {cap.missingFieldKeys.length} more field{cap.missingFieldKeys.length === 1 ? "" : "s"}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
