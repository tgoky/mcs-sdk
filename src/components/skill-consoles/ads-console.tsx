"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

export function AdsConsole({ engagementId }: { engagementId: string }) {
  const [productId, setProductId] = useState("");
  const [creativeBrief, setCreativeBrief] = useState("");
  const [budgetDollars, setBudgetDollars] = useState("");
  const [budgetLevel, setBudgetLevel] = useState<"ad_group" | "campaign">("campaign");
  const [runId, setRunId] = useState<string | null>(null);
  const [adId, setAdId] = useState("");
  const [flipMessage, setFlipMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function draft() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/whop-agent/ads-draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, creativeBrief, budgetCents: Math.round(Number(budgetDollars) * 100), budgetLevel }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setRunId(body.runId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start the draft.");
    } finally {
      setSubmitting(false);
    }
  }

  async function queueFlip() {
    if (!adId.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/whop-agent/ads-draft`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adId, budgetCents: Math.round(Number(budgetDollars) * 100) }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setFlipMessage(`Queued as ${body.pendingActionId}. Approve from the Queue (needs elevated scope, starts real Meta spend).`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to queue flip-to-active.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50/60 dark:bg-amber-950/20 p-3 text-xs text-amber-700 dark:text-amber-300">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <p>Beta-tier Whop feature. Media generation costs money before any draft exists. Check your Whop balance first.</p>
      </div>

      <div className="space-y-2">
        <input value={productId} onChange={(e) => setProductId(e.target.value)} placeholder="Product id" className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-sm font-mono" />
        <textarea value={creativeBrief} onChange={(e) => setCreativeBrief(e.target.value)} rows={3} placeholder="Creative brief" className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-sm" />
        <div className="flex gap-2">
          <input value={budgetDollars} onChange={(e) => setBudgetDollars(e.target.value)} placeholder="Budget ($)" type="number" className="flex-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-sm" />
          <select value={budgetLevel} onChange={(e) => setBudgetLevel(e.target.value as "ad_group" | "campaign")} className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-sm">
            <option value="campaign">Campaign budget</option>
            <option value="ad_group">Ad group budget</option>
          </select>
        </div>
        <button
          type="button"
          onClick={draft}
          disabled={submitting || !productId.trim() || !creativeBrief.trim() || !budgetDollars}
          className="rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 px-4 py-2 text-xs font-bold disabled:opacity-50"
        >
          Draft ad (creates in &quot;draft&quot; status only)
        </button>
      </div>

      {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
      {runId && (
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          Draft started: <Link href={`/dashboard/runs/${runId}`} className="underline font-semibold">view progress in Run History</Link>.
        </p>
      )}

      <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800/80 space-y-2">
        <h3 className="text-xs font-bold text-rose-600 dark:text-rose-400">Flip to active (spends real money)</h3>
        <input value={adId} onChange={(e) => setAdId(e.target.value)} placeholder="Ad id (from the draft run above)" className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-sm font-mono" />
        <button type="button" onClick={queueFlip} disabled={submitting || !adId.trim()} className="rounded-lg bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 text-xs font-bold disabled:opacity-50">
          Queue flip-to-active for approval
        </button>
        {flipMessage && <p className="text-xs text-emerald-600 dark:text-emerald-400">{flipMessage}</p>}
      </div>
    </div>
  );
}
