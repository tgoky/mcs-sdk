"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, Check, Loader2 } from "lucide-react";

const STATUS_STYLES: Record<string, string> = {
  open: "bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-400",
  acknowledged: "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-400",
  resolved: "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-400",
};

function signalClassLabel(signalClass: string): string {
  return signalClass.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

export interface IncidentRowData {
  id: string;
  engagementId: string;
  buyer: string;
  severityScore: number;
  summary: string;
  status: string;
  signalClass: string | null;
}

/** The one real close-out action for a declared incident — see the
 * resolve route's own doc for why this didn't exist before. Resolving
 * here is also what lets the reputation-crisis send gate
 * (worker-blocking-conditions.ts) clear, since that gate only checks
 * status === "open". */
export function IncidentRow({ incident }: { incident: IncidentRowData }) {
  const router = useRouter();
  const [resolving, setResolving] = useState(false);
  const [status, setStatus] = useState(incident.status);

  async function handleResolve(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setResolving(true);
    try {
      const res = await fetch(`/api/engagements/${incident.engagementId}/incidents/${incident.id}/resolve`, {
        method: "POST",
      });
      if (res.ok) {
        setStatus("resolved");
        router.refresh();
      }
    } finally {
      setResolving(false);
    }
  }

  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-zinc-200 dark:border-zinc-800 p-3.5 hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-900/40 transition-colors">
      <Link href={`/dashboard/engagements/${incident.engagementId}`} className="flex items-start gap-3 min-w-0 flex-1">
        <AlertTriangle className="w-4 h-4 mt-0.5 text-rose-500 dark:text-rose-400 shrink-0" />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">{incident.buyer}</p>
            <span className="text-[11px] text-zinc-400 dark:text-zinc-500 font-mono">severity {incident.severityScore}</span>
            {incident.signalClass && (
              <span
                className="text-[10px] font-semibold uppercase rounded-md border border-purple-200 dark:border-purple-900 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-400 px-1.5 py-0.5"
                title="Declared regardless of severity score because of this signal class"
              >
                Force-triggered · {signalClassLabel(incident.signalClass)}
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-2">{incident.summary}</p>
        </div>
      </Link>

      <div className="shrink-0 flex items-center gap-2">
        {status === "open" && (
          <button
            type="button"
            onClick={handleResolve}
            disabled={resolving}
            className="inline-flex items-center gap-1 rounded-md border border-zinc-200 dark:border-zinc-800 px-2 py-0.5 text-[10px] font-semibold uppercase text-zinc-600 dark:text-zinc-400 hover:border-emerald-300 dark:hover:border-emerald-800 hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors cursor-pointer disabled:opacity-50"
          >
            {resolving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
            Resolve
          </button>
        )}
        <span className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_STYLES[status] ?? STATUS_STYLES.open}`}>
          {status}
        </span>
      </div>
    </div>
  );
}
