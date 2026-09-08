"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, Check, Loader2, FileText, Send } from "lucide-react";

const STATUS_STYLES: Record<string, string> = {
  open: "bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-400",
  acknowledged: "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-400",
  resolved: "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-400",
  external_escalation_pending: "bg-orange-50 dark:bg-orange-950/40 border-orange-200 dark:border-orange-900 text-orange-700 dark:text-orange-400",
};

const TIER_LABELS: Record<string, string> = {
  tier1_one_click: "Tier 1 — drafted, one-click approve",
  tier2_review: "Tier 2 — drafted, review & approve",
  tier3_pause_and_instruct: "Tier 3 — choose a posture",
  tier4_external_escalation: "Tier 4 — external escalation",
};

const RESPONSE_POSTURES = [
  { id: "acknowledge_private_resolution", label: "Acknowledge & invite private resolution" },
  { id: "factual_correction", label: "Non-defensive factual correction" },
  { id: "monitor_only", label: "No public response — monitor only" },
  { id: "escalate_externally", label: "Escalate externally instead" },
];

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
  responseTier: string | null;
  selectedPosture: string | null;
  evidencePackage: string | null;
}

/** The one real close-out action for a declared incident — see the
 * resolve route's own doc for why this didn't exist before. Resolving
 * here is also what lets the reputation-crisis send gate
 * (worker-blocking-conditions.ts) clear, since that gate only checks
 * status === "open". Also surfaces the response-routing tier (see
 * response-routing.ts) and the two follow-up actions it can require: a
 * tier 3 posture choice, or a tier 4 escalation outcome. */
export function IncidentRow({ incident }: { incident: IncidentRowData }) {
  const router = useRouter();
  const [resolving, setResolving] = useState(false);
  const [status, setStatus] = useState(incident.status);
  const [postureBusy, setPostureBusy] = useState<string | null>(null);
  const [postureError, setPostureError] = useState<string | null>(null);
  const [selectedPosture, setSelectedPosture] = useState(incident.selectedPosture);
  const [showEvidence, setShowEvidence] = useState(false);
  const [outcomeText, setOutcomeText] = useState("");
  const [outcomeBusy, setOutcomeBusy] = useState(false);

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

  async function handleChoosePosture(e: React.MouseEvent, posture: string) {
    e.preventDefault();
    e.stopPropagation();
    setPostureBusy(posture);
    setPostureError(null);
    try {
      const res = await fetch(`/api/engagements/${incident.engagementId}/incidents/${incident.id}/posture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ posture }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPostureError(data.error ?? "Failed to save posture.");
        return;
      }
      setSelectedPosture(posture);
      router.refresh();
    } finally {
      setPostureBusy(null);
    }
  }

  async function handleLogOutcome(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!outcomeText.trim()) return;
    setOutcomeBusy(true);
    try {
      const res = await fetch(`/api/engagements/${incident.engagementId}/incidents/${incident.id}/escalate-outcome`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcomeDetail: outcomeText.trim() }),
      });
      if (res.ok) {
        setStatus("resolved");
        router.refresh();
      }
    } finally {
      setOutcomeBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-zinc-200 dark:border-zinc-800 p-3.5 hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-900/40 transition-colors">
      <div className="flex items-start justify-between gap-3">
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
              {incident.responseTier && (
                <span className="text-[10px] font-semibold rounded-md border border-sky-200 dark:border-sky-900 bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-400 px-1.5 py-0.5">
                  {TIER_LABELS[incident.responseTier] ?? incident.responseTier}
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
            {status.replace(/_/g, " ")}
          </span>
        </div>
      </div>

      {/* Tier 3: no draft exists until a posture is chosen. */}
      {status === "open" && incident.responseTier === "tier3_pause_and_instruct" && !selectedPosture && (
        <div className="ml-7 rounded-lg border border-sky-200 dark:border-sky-900 bg-sky-50/50 dark:bg-sky-950/20 p-2.5">
          <p className="text-[11px] font-semibold text-sky-700 dark:text-sky-400 mb-1.5">
            Choose a response posture — nothing is drafted until you do:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {RESPONSE_POSTURES.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={(e) => handleChoosePosture(e, p.id)}
                disabled={postureBusy !== null}
                className="rounded-md border border-sky-200 dark:border-sky-900 bg-white dark:bg-zinc-900 px-2 py-1 text-[11px] font-medium text-sky-700 dark:text-sky-400 hover:bg-sky-100 dark:hover:bg-sky-950/40 transition-colors cursor-pointer disabled:opacity-50"
              >
                {postureBusy === p.id ? <Loader2 className="w-3 h-3 animate-spin inline mr-1" /> : null}
                {p.label}
              </button>
            ))}
          </div>
          {postureError && <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-1.5">{postureError}</p>}
        </div>
      )}
      {selectedPosture && (
        <p className="ml-7 text-[11px] text-zinc-500 dark:text-zinc-400">
          Posture chosen: {RESPONSE_POSTURES.find((p) => p.id === selectedPosture)?.label ?? selectedPosture} — draft queued in the Queue for approval.
        </p>
      )}

      {/* Tier 4: evidence package + outcome logging. */}
      {incident.evidencePackage && (
        <div className="ml-7">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowEvidence((v) => !v);
            }}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-orange-700 dark:text-orange-400 hover:underline cursor-pointer"
          >
            <FileText className="w-3 h-3" />
            {showEvidence ? "Hide evidence package" : "View evidence package"}
          </button>
          {showEvidence && (
            <pre className="mt-1.5 rounded-lg border border-orange-200 dark:border-orange-900 bg-orange-50/50 dark:bg-orange-950/20 p-2.5 text-[11px] text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap font-mono max-h-64 overflow-y-auto">
              {incident.evidencePackage}
            </pre>
          )}
          {status === "external_escalation_pending" && (
            <div className="mt-2 flex items-center gap-1.5">
              <input
                type="text"
                value={outcomeText}
                onChange={(e) => setOutcomeText(e.target.value)}
                placeholder="What happened with counsel/the platform?"
                className="flex-1 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2 py-1 text-[11px] text-zinc-700 dark:text-zinc-300 placeholder:text-zinc-400"
              />
              <button
                type="button"
                onClick={handleLogOutcome}
                disabled={outcomeBusy || !outcomeText.trim()}
                className="inline-flex items-center gap-1 rounded-md border border-orange-200 dark:border-orange-900 bg-orange-50 dark:bg-orange-950/40 px-2 py-1 text-[11px] font-semibold text-orange-700 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-950/60 transition-colors cursor-pointer disabled:opacity-50"
              >
                {outcomeBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                Log outcome
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
