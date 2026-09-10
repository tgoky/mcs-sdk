"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { InputField, SelectField } from "@/app/dashboard/engagements/new/form-fields";
import type { ColdOpenSendPlatformId } from "@/models/schema";

type MapRow = { icp: string; campaignId: string };

export function SendConnectConfigForm({ engagementId, onCancel, cancelLabel = "Close" }: { engagementId: string; onCancel: () => void; cancelLabel?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [buyer, setBuyer] = useState("");

  const [platform, setPlatform] = useState<ColdOpenSendPlatformId>("instantly");
  const [credentialValue, setCredentialValue] = useState("");
  const [mapRows, setMapRows] = useState<MapRow[]>([{ icp: "", campaignId: "" }]);
  const [autoPushIcps, setAutoPushIcps] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [savingCredential, setSavingCredential] = useState(false);
  const [credentialSaved, setCredentialSaved] = useState(false);

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

  async function saveCredential() {
    setSavingCredential(true);
    setCredentialSaved(false);
    try {
      const res = await fetch("/api/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ engagementId, provider: `cold_open_${platform}`, value: credentialValue }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to save credential");
      setCredentialSaved(true);
      setCredentialValue("");
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save credential");
    } finally {
      setSavingCredential(false);
    }
  }

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
      router.refresh();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-6 text-xs font-mono text-zinc-500 dark:text-zinc-400">Loading…</div>;
  if (loadError) return <div className="p-6 text-xs font-mono font-semibold text-rose-600 dark:text-rose-400">⚠ {loadError}</div>;

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

      <SelectField
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

      <div className="flex items-end gap-2">
        <div className="flex-1">
          <InputField label={`${platform} API key`} value={credentialValue} onChange={setCredentialValue} placeholder="paste your key" />
        </div>
        <button type="button" onClick={saveCredential} disabled={savingCredential || !credentialValue.trim()} className="mb-1.5 px-3 py-2 text-xs font-bold rounded-lg border border-zinc-300 dark:border-zinc-700 disabled:opacity-40 cursor-pointer">
          {savingCredential ? "Saving…" : credentialSaved ? "Saved ✓" : "Save key"}
        </button>
      </div>

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

      {saveError && <p className="text-xs font-mono font-semibold text-rose-600 dark:text-rose-400">⚠ {saveError}</p>}
      {saved && !saveError && <p className="text-xs font-mono font-semibold text-emerald-600 dark:text-emerald-400">✓ Saved.</p>}

      <div className="flex justify-between pt-2 border-t border-zinc-200 dark:border-zinc-800">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-xs font-bold rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 cursor-pointer">
          {cancelLabel}
        </button>
        <button type="button" onClick={handleSubmit} disabled={saving || !canSubmit} className="px-5 py-2 text-xs font-bold rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-50 dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
