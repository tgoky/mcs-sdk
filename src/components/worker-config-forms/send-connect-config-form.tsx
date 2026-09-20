"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { InputField, SelectField } from "@/app/dashboard/engagements/new/form-fields";
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
type RemoteIcp = { slug: string; label: string };
type RemoteCampaign = { id: string; name: string };

export function SendConnectConfigForm({ engagementId, onCancel, cancelLabel = "Close" }: { engagementId: string; onCancel: () => void; cancelLabel?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [buyer, setBuyer] = useState("");

  const [platform, setPlatform] = useState<ColdOpenSendPlatformId>("instantly");
  const [mapRows, setMapRows] = useState<MapRow[]>([{ icp: "", campaignId: "" }]);
  const [autoPushIcps, setAutoPushIcps] = useState("");
  const [icps, setIcps] = useState<RemoteIcp[]>([]);

  // Live campaigns from the connected ESP account — every ESPAdapter
  // already implements listCampaigns() server-side (esp/base.ts); this
  // fetches it before save instead of only verifying a hand-typed id
  // after the fact.
  const [campaigns, setCampaigns] = useState<RemoteCampaign[]>([]);
  const [fetchingCampaigns, setFetchingCampaigns] = useState(false);
  const [campaignsError, setCampaignsError] = useState<string | null>(null);

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
        setIcps(Array.isArray(data.icps) ? data.icps.map((i: { slug: string; label: string }) => ({ slug: i.slug, label: i.label })) : []);
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

  const fetchCampaigns = useCallback(() => {
    let cancelled = false;
    setFetchingCampaigns(true);
    setCampaignsError(null);
    (async () => {
      try {
        const res = await fetch(`/api/engagements/${engagementId}/bridges/send-connect/campaigns`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ platform }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error ?? "Failed to fetch campaigns");
        setCampaigns(data.campaigns ?? []);
      } catch (e) {
        if (!cancelled) {
          setCampaigns([]);
          setCampaignsError(e instanceof Error ? e.message : "Failed to fetch campaigns");
        }
      } finally {
        if (!cancelled) setFetchingCampaigns(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [engagementId, platform]);

  // Re-fetch whenever the platform changes, once loading has settled (the
  // credential may or may not be connected yet — a 400 just surfaces as
  // campaignsError, same as every other live-fetch dropdown in this app).
  useEffect(() => {
    if (loading) return;
    return fetchCampaigns();
  }, [loading, fetchCampaigns]);

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

  const icpOptions = icps.map((i) => ({ value: i.slug, label: `${i.label} (${i.slug})` }));
  const campaignOptions = campaigns.map((c) => ({ value: c.id, label: c.name ? `${c.name} (${c.id})` : c.id }));

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
          <CredentialRow engagementId={engagementId} provider={`cold_open_${platform}`} label={`${SEND_PLATFORM_LABELS[platform]} key`} onSaved={fetchCampaigns} />
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
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">ICP → campaign map</h2>
              <button type="button" onClick={fetchCampaigns} disabled={fetchingCampaigns} className="text-[11px] font-semibold text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 disabled:opacity-40 cursor-pointer">
                {fetchingCampaigns ? "Refreshing…" : "↻ Refresh campaigns"}
              </button>
            </div>
            {icps.length === 0 && (
              <p className="text-[11px] font-mono text-amber-600 dark:text-amber-400">No ICPs locked yet — run ICP Lock first, then come back to map each one to a campaign.</p>
            )}
            {fetchingCampaigns && <p className="text-[11px] italic font-mono text-zinc-500 dark:text-zinc-400 animate-pulse">⚡ Contacting {SEND_PLATFORM_LABELS[platform]}… fetching live campaigns…</p>}
            {campaignsError && !fetchingCampaigns && (
              <div className="rounded-sm p-3 text-[11px] font-mono border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 shadow-sm">
                ⚠ Couldn&apos;t load campaigns: {campaignsError} — you can still paste a campaign id by hand below.
              </div>
            )}
            {mapRows.map((row, i) => (
              <div key={i} className="grid gap-2 grid-cols-1 md:grid-cols-2 items-end">
                {icpOptions.length > 0 ? (
                  <SelectField label="ICP" value={row.icp} onChange={(v) => updateRow(i, { icp: v })} options={[{ value: "", label: "-- Choose a locked ICP --" }, ...icpOptions]} />
                ) : (
                  <InputField label="ICP slug" value={row.icp} onChange={(v) => updateRow(i, { icp: v })} placeholder="boutique-agency" />
                )}
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    {campaignOptions.length > 0 ? (
                      <SelectField
                        label="Campaign"
                        value={row.campaignId}
                        onChange={(v) => updateRow(i, { campaignId: v })}
                        disabled={fetchingCampaigns}
                        options={[{ value: "", label: fetchingCampaigns ? "-- Loading… --" : "-- Choose a live campaign --" }, ...campaignOptions]}
                      />
                    ) : (
                      <InputField
                        label="Campaign id"
                        value={row.campaignId}
                        onChange={(v) => updateRow(i, { campaignId: v })}
                        placeholder="the real campaign id from your ESP"
                        helpText={fetchingCampaigns ? undefined : "Connect the key above to pick from a live list instead of typing this by hand."}
                      />
                    )}
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

          {icpOptions.length > 0 ? (
            <SelectField
              label="Auto-push ICP (optional)"
              value=""
              onChange={(v) => {
                if (!v) return;
                const current = autoPushIcps.split(",").map((s) => s.trim()).filter(Boolean);
                if (!current.includes(v)) setAutoPushIcps([...current, v].join(", "));
              }}
              options={[{ value: "", label: "-- Add an ICP to auto-push --" }, ...icpOptions.filter((o) => !autoPushIcps.split(",").map((s) => s.trim()).includes(o.value))]}
              helpText={
                autoPushIcps
                  ? `Bypassing review for: ${autoPushIcps}. Bypasses the review-required hold for these ICPs, if any are set in ICP Lock.`
                  : "Bypasses the review-required hold for the ICPs you add here, if any are set in ICP Lock."
              }
            />
          ) : (
            <InputField label="Auto-push ICPs (comma-separated, optional)" value={autoPushIcps} onChange={setAutoPushIcps} placeholder="boutique-agency" helpText="Bypasses the review-required hold for these ICPs, if any are set in ICP Lock." />
          )}
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
