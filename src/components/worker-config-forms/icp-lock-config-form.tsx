"use client";

// ICP Lock's own hinges form — same load/save/cancel shell every other
// worker-config-forms component uses (see leak-map-config-form.tsx's own
// header). Unlike those, this one also drives the runOnSetup bridge page
// (bridges/icp-lock/page.tsx) since ICP Lock gates enabling the same way
// rep-onboarding's identity graph does.
//
// Simplifications from the full spec (honest v1 scope, not silently
// assumed): productAllocation is auto-derived as { [productName]: 1.0 } —
// the single-offer case the source pack itself calls out as the common
// default; a buyer running two offers through one engagement is real but
// rarer, and multi-offer allocation editing is real, separately-scoped
// follow-up work.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { InputField } from "@/app/dashboard/engagements/new/form-fields";
import type { ColdOpenIcp, ColdOpenSizingBound } from "@/models/schema";

type IcpRow = { slug: string; label: string; weight: string; teamSizeMin: string; teamSizeMax: string; disqualifyIf: string };

function emptyIcpRow(): IcpRow {
  return { slug: "", label: "", weight: "", teamSizeMin: "", teamSizeMax: "", disqualifyIf: "" };
}

export function IcpLockConfigForm({
  engagementId,
  onCancel,
  onSaved,
  cancelLabel = "Close",
}: {
  engagementId: string;
  onCancel: () => void;
  onSaved?: (result: { runId?: string }) => void;
  cancelLabel?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [buyer, setBuyer] = useState("");
  const [wasDisabled, setWasDisabled] = useState(false);

  const [productName, setProductName] = useState("");
  const [productUrl, setProductUrl] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [productValueProp, setProductValueProp] = useState("");
  const [icpRows, setIcpRows] = useState<IcpRow[]>([emptyIcpRow()]);
  const [reviewRequiredIcps, setReviewRequiredIcps] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/engagements/${engagementId}/bridges/icp-lock`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load");
        if (cancelled) return;

        setBuyer(data.buyer ?? "");
        setWasDisabled(data.enabled === false);
        if (data.config) {
          setProductName(data.config.productName ?? data.buyer ?? "");
          setProductUrl(data.config.productUrl ?? "");
          setProductPrice(data.config.productPrice ?? "");
          setProductValueProp(data.config.productValueProp ?? "");
          const bounds: Record<string, ColdOpenSizingBound> = data.config.sizingBounds ?? {};
          const icps: ColdOpenIcp[] = data.config.icps ?? [];
          if (icps.length > 0) {
            setIcpRows(
              icps.map((icp) => ({
                slug: icp.slug,
                label: icp.label,
                weight: String(icp.weight),
                teamSizeMin: bounds[icp.slug]?.teamSizeMin !== undefined ? String(bounds[icp.slug].teamSizeMin) : "",
                teamSizeMax: bounds[icp.slug]?.teamSizeMax !== undefined ? String(bounds[icp.slug].teamSizeMax) : "",
                disqualifyIf: (bounds[icp.slug]?.disqualifyIf ?? []).join(", "),
              }))
            );
          }
          setReviewRequiredIcps((data.config.reviewRequiredIcps ?? []).join(", "));
        } else if (data.buyer) {
          setProductName(data.buyer);
        }
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

  function updateRow(i: number, patch: Partial<IcpRow>) {
    setIcpRows((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setIcpRows((rows) => [...rows, emptyIcpRow()]);
  }
  function removeRow(i: number) {
    setIcpRows((rows) => rows.filter((_, idx) => idx !== i));
  }

  const cleanRows = icpRows.filter((r) => r.slug.trim() && r.label.trim());
  const canSubmit = productName.trim() && productUrl.trim() && productValueProp.trim() && cleanRows.length > 0;

  async function handleSubmit() {
    setSaving(true);
    setSaveError(null);
    try {
      const icps: ColdOpenIcp[] = cleanRows.map((r) => ({ slug: r.slug.trim(), label: r.label.trim(), weight: Number(r.weight) || 1 / cleanRows.length }));
      const sizingBounds: Record<string, ColdOpenSizingBound> = {};
      for (const r of cleanRows) {
        sizingBounds[r.slug.trim()] = {
          teamSizeMin: r.teamSizeMin ? Number(r.teamSizeMin) : undefined,
          teamSizeMax: r.teamSizeMax ? Number(r.teamSizeMax) : undefined,
          disqualifyIf: r.disqualifyIf.split(",").map((s) => s.trim()).filter(Boolean),
        };
      }
      const res = await fetch(`/api/engagements/${engagementId}/bridges/icp-lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName: productName.trim(),
          productUrl: productUrl.trim(),
          productPrice: productPrice.trim(),
          productValueProp: productValueProp.trim(),
          productAllocation: { [productName.trim()]: 1.0 },
          icps,
          sizingBounds,
          reviewRequiredIcps: reviewRequiredIcps.split(",").map((s) => s.trim()).filter(Boolean),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      router.refresh();
      if (onSaved) onSaved({ runId: data.runId });
      else onCancel();
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
          <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">ICP Lock{buyer ? ` — ${buyer}` : ""}</h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Who this client sells to — the spine every other Cold Open skill reads. Must be saved first.</p>
        </div>
        <button type="button" onClick={onCancel} className="shrink-0 text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 cursor-pointer">
          {cancelLabel}
        </button>
      </div>

      {wasDisabled && (
        <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-lg px-3 py-2">
          ICP Lock is currently turned off for this client — saving below turns it back on.
        </p>
      )}

      <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
        <InputField label="Product / offer name" value={productName} onChange={setProductName} required />
        <InputField label="Product URL" value={productUrl} onChange={setProductUrl} placeholder="acme.com" required />
        <InputField label="Price" value={productPrice} onChange={setProductPrice} placeholder="$99/mo" />
        <InputField label="Value proposition" value={productValueProp} onChange={setProductValueProp} placeholder="one sentence" required />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">ICPs</h2>
          <button type="button" onClick={addRow} className="text-xs font-semibold text-amber-600 dark:text-amber-400 cursor-pointer">
            + Add ICP
          </button>
        </div>
        {icpRows.map((row, i) => (
          <div key={i} className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3 space-y-2">
            <div className="grid gap-2 grid-cols-2 md:grid-cols-4">
              <InputField label="Slug" value={row.slug} onChange={(v) => updateRow(i, { slug: v })} placeholder="boutique-agency" />
              <InputField label="Label" value={row.label} onChange={(v) => updateRow(i, { label: v })} placeholder="Boutique agencies" />
              <InputField label="Weight" value={row.weight} onChange={(v) => updateRow(i, { weight: v })} placeholder="0.6" />
              <InputField label="Team size max" value={row.teamSizeMax} onChange={(v) => updateRow(i, { teamSizeMax: v })} placeholder="30" />
            </div>
            <InputField label="Disqualify if (comma-separated)" value={row.disqualifyIf} onChange={(v) => updateRow(i, { disqualifyIf: v })} placeholder="team_size > 50" />
            {icpRows.length > 1 && (
              <button type="button" onClick={() => removeRow(i)} className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 cursor-pointer">
                Remove
              </button>
            )}
          </div>
        ))}
      </div>

      <InputField label="Review-required ICPs (comma-separated slugs, optional)" value={reviewRequiredIcps} onChange={setReviewRequiredIcps} placeholder="enterprise" />

      {saveError && <p className="text-xs font-mono font-semibold text-rose-600 dark:text-rose-400">⚠ {saveError}</p>}

      <div className="flex justify-between pt-2 border-t border-zinc-200 dark:border-zinc-800">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-xs font-bold rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 cursor-pointer">
          {cancelLabel}
        </button>
        <button type="button" onClick={handleSubmit} disabled={saving || !canSubmit} className="px-5 py-2 text-xs font-bold rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-50 dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
          {saving ? "Saving…" : "Save & enable"}
        </button>
      </div>
    </div>
  );
}
