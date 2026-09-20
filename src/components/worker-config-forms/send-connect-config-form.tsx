"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { InputField } from "@/app/dashboard/engagements/new/form-fields";
import type { ColdOpenSendPlatformId } from "@/models/schema";
import { ConfigFormSkeleton } from "./config-form-skeleton";
import { useToast } from "@/components/toast/toast-provider";
import { CredentialRow } from "@/app/dashboard/engagements/[id]/update-credentials-form";
import { WorkerCapabilityMatrix } from "@/components/worker-capability-matrix";
import { ChoiceCardGroup } from "@/components/choice-card-group";
import { ProgressiveFlow, type ProgressiveFlowStep } from "@/components/progressive-flow";
import { BehaviorSummary } from "./behavior-summary";

const SEND_PLATFORM_LABELS: Record<ColdOpenSendPlatformId, string> = {
  instantly: "Instantly",
  smartlead: "SmartLead",
  lemlist: "Lemlist",
  reply_io: "Reply.io",
};

type MapRow = { icp: string; campaignId: string };

export function SendConnectConfigForm({ engagementId, onCancel, cancelLabel = "Close" }: { engagementId: string; onCancel: () => void; cancelLabel?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [buyer, setBuyer] = useState("");

  const [platform, setPlatform] = useState<ColdOpenSendPlatformId>("instantly");
  const [mapRows, setMapRows] = useState<MapRow[]>([{ icp: "", campaignId: "" }]);
  const [autoPushIcps, setAutoPushIcps] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/engagements/${engagementId}/bridges/send-connect`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load");
        if (cancelled) return;
        setBuyer(data.buyer ?? "");
        if (data.sendPlatform?.platform) setPlatform(data.sendPlatform.platform);
        const map: Record<string, string> = data.campaignMap ?? {};
        if (Object.keys(map).length > 0) setMapRows(Object.entries(map).map(([icp, campaignId]) => ({ icp, campaignId: String(campaignId) })));
        setAutoPushIcps((data.autoPushIcps ?? []).join(", "));
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [engagementId]);

  function updateRow(i: number, patch: Partial<MapRow>) {
    setMapRows((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  const cleanRows = mapRows.filter((r) => r.icp.trim() && r.campaignId.trim());
  const canSubmit = cleanRows.length > 0;

  async function handleSubmit() {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const campaignMap = Object.fromEntries(cleanRows.map((r) => [r.icp.trim(), r.campaignId.trim()]));
      const res = await fetch(`/api/engagements/${engagementId}/bridges/send-connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, campaignMap, autoPushIcps: autoPushIcps.split(",").map((s) => s.trim()).filter(Boolean) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setSaved(true);
      toast.success(`Send Connect saved${buyer ? ` for ${buyer}` : ""}.`);
      router.refresh();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <ConfigFormSkeleton />;
  if (loadError) return <div className="p-6 text-xs font-mono font-semibold text-rose-600 dark:text-rose-400">⚠ {loadError}</div>;

  const steps: ProgressiveFlowStep[] = [
    {
      id: "platform",
      label: "Sending platform",
      isComplete: true,
      content: (
        <div className="space-y-4">
          <ChoiceCardGroup
            label="Sending platform"
            value={platform}
            onChange={(v) => setPlatform(v as ColdOpenSendPlatformId)}
            options={[
              { value: "instantly", label: "Instantly" },
              { value: "smartlead", label: "SmartLead" },
              { value: "lemlist", label: "Lemlist" },
              { value: "reply_io", label: "Reply.io" },
            ]}
          />
          <CredentialRow engagementId={engagementId} provider={`cold_open_${platform}`} label={`${SEND_PLATFORM_LABELS[platform]} key`} />
        </div>
      ),
    },
    {
      id: "campaign-map",
      label: "Campaign map",
      isComplete: Boolean(canSubmit),
      content: (
        <div className="space-y-5">
          <div className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">ICP → campaign map</h2>
            {mapRows.map((row, i) => (
              <div key={i} className="grid gap-2 grid-cols-1 md:grid-cols-2 items-end">
                <InputField label="ICP slug" value={row.icp} onChange={(v) => updateRow(i, { icp: v })} placeholder="boutique-agency" />
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <InputField label="Campaign id" value={row.campaignId} onChange={(v) => updateRow(i, { campaignId: v })} placeholder="the real campaign id from your ESP" />
                  </div>
                  {mapRows.length > 1 && (
                    <button type="button" onClick={() => setMapRows((rows) => rows.filter((_, idx) => idx !== i))} className="mb-1.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400 cursor-pointer">
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
            <button type="button" onClick={() => setMapRows((rows) => [...rows, { icp: "", campaignId: "" }])} className="text-xs font-semibold text-amber-600 dark:text-amber-400 cursor-pointer">
              + Add mapping
            </button>
          </div>

          <InputField label="Auto-push ICPs (comma-separated, optional)" value={autoPushIcps} onChange={setAutoPushIcps} placeholder="boutique-agency" helpText="Bypasses the review-required hold for these ICPs, if any are set in ICP Lock." />
        </div>
      ),
    },
  ];

  const pushIcpList = autoPushIcps.split(",").map((s) => s.trim()).filter(Boolean);
  const summaryLines: string[] = [
    `Outbound sends go through ${SEND_PLATFORM_LABELS[platform]}.`,
    cleanRows.length === 0
      ? "No ICP has a campaign mapped yet — nothing will send until at least one is."
      : `${cleanRows.length} ICP${cleanRows.length === 1 ? "" : "s"} mapped to a live campaign.`,
    pushIcpList.length === 0
      ? "Every matched lead is held for human review before sending."
      : `Leads for ${pushIcpList.join(", ")} auto-push without review; every other ICP is still held.`,
  ];

  return (
    <div className="max-w-3xl mx-auto py-6 px-4 space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Send Connect{buyer ? ` — ${buyer}` : ""}</h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">The sending platform, campaign map, and which ICPs are allowed to auto-push.</p>
        </div>
        <button type="button" onClick={onCancel} className="shrink-0 text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 cursor-pointer">
          {cancelLabel}
        </button>
      </div>

      <WorkerCapabilityMatrix workerId="send-connect" engagementId={engagementId} />

      <BehaviorSummary lines={summaryLines} />

      <ProgressiveFlow steps={steps} onFinish={handleSubmit} finishLabel="Save" finishDisabled={saving || !canSubmit} finishing={saving} />

      {saveError && <p className="text-xs font-mono font-semibold text-rose-600 dark:text-rose-400">⚠ {saveError}</p>}
      {saved && !saveError && <p className="text-xs font-mono font-semibold text-emerald-600 dark:text-emerald-400">✓ Saved.</p>}

      <div className="flex justify-end pt-2 border-t border-zinc-200 dark:border-zinc-800">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-xs font-bold rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 cursor-pointer">
          {cancelLabel}
        </button>
      </div>
    </div>
  );
}
