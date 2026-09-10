"use client";

// Source Connect's hinges form. Only "csv" gets a real column-mapping UI
// here — apify accepts an actor id + credential; sales_nav is a
// hand-exported file with nothing to configure automatically. See
// source-connect.ts's own header for why.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { InputField, TextAreaField, SelectField } from "@/app/dashboard/engagements/new/form-fields";
import type { ColdOpenLeadSource, ColdOpenLeadSourceType } from "@/models/schema";

type SourceRow = {
  icp: string;
  fetcherType: ColdOpenLeadSourceType;
  dailyLimit: string;
  csvContent: string;
  mapEmail: string;
  mapCompany: string;
  mapFirstName: string;
  mapLastName: string;
  apifyActorId: string;
};

function emptyRow(): SourceRow {
  return { icp: "", fetcherType: "csv", dailyLimit: "", csvContent: "", mapEmail: "Email", mapCompany: "Company", mapFirstName: "First Name", mapLastName: "Last Name", apifyActorId: "" };
}

export function SourceConnectConfigForm({ engagementId, onCancel, cancelLabel = "Close" }: { engagementId: string; onCancel: () => void; cancelLabel?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [buyer, setBuyer] = useState("");
  const [rows, setRows] = useState<SourceRow[]>([emptyRow()]);
  const [apifyToken, setApifyToken] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [savingToken, setSavingToken] = useState(false);
  const [tokenSaved, setTokenSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/engagements/${engagementId}/bridges/source-connect`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load");
        if (cancelled) return;
        setBuyer(data.buyer ?? "");
        const sources: ColdOpenLeadSource[] = data.leadSources ?? [];
        if (sources.length > 0) {
          setRows(
            sources.map((s) => ({
              icp: s.icp,
              fetcherType: s.fetcherType,
              dailyLimit: s.dailyLimit ? String(s.dailyLimit) : "",
              csvContent: s.csvContent ?? "",
              mapEmail: s.csvMapping?.email ?? "Email",
              mapCompany: s.csvMapping?.companyName ?? "Company",
              mapFirstName: s.csvMapping?.firstName ?? "First Name",
              mapLastName: s.csvMapping?.lastName ?? "Last Name",
              apifyActorId: s.apifyActorId ?? "",
            }))
          );
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

  function updateRow(i: number, patch: Partial<SourceRow>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function saveApifyToken() {
    setSavingToken(true);
    setTokenSaved(false);
    try {
      const res = await fetch("/api/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ engagementId, provider: "cold_open_apify", value: apifyToken }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to save token");
      setTokenSaved(true);
      setApifyToken("");
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save Apify token");
    } finally {
      setSavingToken(false);
    }
  }

  const canSubmit = rows.some((r) => r.icp.trim());

  async function handleSubmit() {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const leadSources: ColdOpenLeadSource[] = rows
        .filter((r) => r.icp.trim())
        .map((r) => ({
          icp: r.icp.trim(),
          fetcherType: r.fetcherType,
          dailyLimit: r.dailyLimit ? Number(r.dailyLimit) : undefined,
          ...(r.fetcherType === "csv"
            ? { csvContent: r.csvContent, csvMapping: { email: r.mapEmail, companyName: r.mapCompany, firstName: r.mapFirstName, lastName: r.mapLastName } }
            : {}),
          ...(r.fetcherType === "apify" ? { apifyActorId: r.apifyActorId.trim() } : {}),
        }));

      const res = await fetch(`/api/engagements/${engagementId}/bridges/source-connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadSources }),
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
          <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Source Connect{buyer ? ` — ${buyer}` : ""}</h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Where leads come from, one source per ICP.</p>
        </div>
        <button type="button" onClick={onCancel} className="shrink-0 text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 cursor-pointer">
          {cancelLabel}
        </button>
      </div>

      <div className="flex items-end gap-2">
        <div className="flex-1">
          <InputField label="Apify API token (only needed for an apify source)" value={apifyToken} onChange={setApifyToken} placeholder="apify_api_..." />
        </div>
        <button type="button" onClick={saveApifyToken} disabled={savingToken || !apifyToken.trim()} className="mb-1.5 px-3 py-2 text-xs font-bold rounded-lg border border-zinc-300 dark:border-zinc-700 disabled:opacity-40 cursor-pointer">
          {savingToken ? "Saving…" : tokenSaved ? "Saved ✓" : "Save token"}
        </button>
      </div>

      <div className="space-y-3">
        {rows.map((row, i) => (
          <div key={i} className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3 space-y-2">
            <div className="grid gap-2 grid-cols-1 md:grid-cols-3">
              <InputField label="ICP slug" value={row.icp} onChange={(v) => updateRow(i, { icp: v })} placeholder="boutique-agency" />
              <SelectField
                label="Source type"
                value={row.fetcherType}
                onChange={(v) => updateRow(i, { fetcherType: v as ColdOpenLeadSourceType })}
                options={[
                  { value: "csv", label: "CSV upload" },
                  { value: "apify", label: "Apify actor" },
                  { value: "sales_nav", label: "Sales Navigator export" },
                ]}
              />
              <InputField label="Daily limit (optional)" value={row.dailyLimit} onChange={(v) => updateRow(i, { dailyLimit: v })} placeholder="20" />
            </div>

            {row.fetcherType === "csv" && (
              <>
                <TextAreaField label="Paste CSV content" value={row.csvContent} onChange={(v) => updateRow(i, { csvContent: v })} rows={4} placeholder={"Email,Company,First Name,Last Name\njane@acme.com,Acme,Jane,Doe"} />
                <div className="grid gap-2 grid-cols-2 md:grid-cols-4">
                  <InputField label="Email column" value={row.mapEmail} onChange={(v) => updateRow(i, { mapEmail: v })} />
                  <InputField label="Company column" value={row.mapCompany} onChange={(v) => updateRow(i, { mapCompany: v })} />
                  <InputField label="First name column" value={row.mapFirstName} onChange={(v) => updateRow(i, { mapFirstName: v })} />
                  <InputField label="Last name column" value={row.mapLastName} onChange={(v) => updateRow(i, { mapLastName: v })} />
                </div>
              </>
            )}
            {row.fetcherType === "apify" && (
              <InputField label="Apify actor id" value={row.apifyActorId} onChange={(v) => updateRow(i, { apifyActorId: v })} placeholder="code_crafter/leads-finder" helpText="Connect only today — a live verification pull isn't built yet." />
            )}
            {row.fetcherType === "sales_nav" && (
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">No automated verification for a hand-exported Sales Navigator source.</p>
            )}

            {rows.length > 1 && (
              <button type="button" onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))} className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 cursor-pointer">
                Remove
              </button>
            )}
          </div>
        ))}
        <button type="button" onClick={() => setRows((rs) => [...rs, emptyRow()])} className="text-xs font-semibold text-amber-600 dark:text-amber-400 cursor-pointer">
          + Add source
        </button>
      </div>

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
