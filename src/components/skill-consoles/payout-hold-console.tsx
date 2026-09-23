"use client";

import { useState } from "react";
import { Loader2, ShieldAlert, CheckCircle2 } from "lucide-react";

interface PayoutHoldPacket {
  accountHealth: { required_actions?: string[]; recommended_actions?: string[]; status?: string; status_reason?: string } | null;
  identityProfile: { payout_status?: string; payouts_enabled?: boolean } | null;
  payoutMethods: Array<{ id: string; is_default?: boolean; institution_name?: string }>;
  chargebackRatio90d: number | null;
  draftedEscalation: string;
  followUpChecklist: string[];
  gatheredManually: string[];
}

export function PayoutHoldConsole({ engagementId }: { engagementId: string }) {
  const [packet, setPacket] = useState<PayoutHoldPacket | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function assemble() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/whop-agent/payout-hold-kit`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setPacket(body.packet);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to assemble the packet.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={assemble}
        disabled={loading}
        className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 px-4 py-2 text-xs font-bold disabled:opacity-50"
      >
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldAlert className="w-3.5 h-3.5" />}
        {packet ? "Re-assemble packet" : "Assemble evidence packet now"}
      </button>
      {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}

      {packet && (
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
              <h3 className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-1">Payout status</h3>
              <p className="text-sm font-semibold">{packet.identityProfile?.payout_status ?? packet.accountHealth?.status ?? "unknown"}</p>
              {packet.accountHealth?.status_reason && <p className="text-xs text-zinc-500 mt-1">{packet.accountHealth.status_reason}</p>}
            </div>
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
              <h3 className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-1">90-day dispute rate</h3>
              <p className="text-sm font-semibold">{packet.chargebackRatio90d !== null ? `${(packet.chargebackRatio90d * 100).toFixed(1)}%` : "unavailable"}</p>
            </div>
          </div>

          {(packet.accountHealth?.required_actions?.length ?? 0) > 0 && (
            <div className="rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50/60 dark:bg-amber-950/20 p-3">
              <h3 className="text-xs font-bold mb-1">Whop&apos;s required actions</h3>
              <ul className="list-disc list-inside text-xs text-zinc-700 dark:text-zinc-300">
                {packet.accountHealth!.required_actions!.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
            <h3 className="text-xs font-bold mb-1">Drafted escalation (send this yourself)</h3>
            <pre className="text-xs whitespace-pre-wrap font-sans text-zinc-700 dark:text-zinc-300">{packet.draftedEscalation}</pre>
          </div>

          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
            <h3 className="text-xs font-bold mb-1">Follow-up checklist</h3>
            <ul className="space-y-1">
              {packet.followUpChecklist.map((item) => (
                <li key={item} className="flex items-start gap-1.5 text-xs text-zinc-700 dark:text-zinc-300">
                  <CheckCircle2 className="w-3 h-3 mt-0.5 shrink-0 text-zinc-400" /> {item}
                </li>
              ))}
            </ul>
          </div>

          {packet.gatheredManually.length > 0 && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Gather manually: {packet.gatheredManually.join(", ")}</p>
          )}
        </div>
      )}
    </div>
  );
}
