"use client";

// Shared by workers-panel.tsx / product-detail-client.tsx's inline
// Configure expand AND the dedicated whop-bridge-manager page's console
// (bridge-manager-console.tsx) — was two copies of the same destination-
// URL/field-mapping form before this, one of them (the console) missing a
// GET entirely and unable to show what was already saved.

import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { InputField, TextAreaField } from "@/app/dashboard/engagements/new/form-fields";

export function WhopBridgeManagerConfigForm({
  engagementId,
  onCancel,
  onSaved,
  cancelLabel = "Back to engagement",
}: {
  engagementId: string;
  onCancel: () => void;
  onSaved?: () => void;
  cancelLabel?: string;
}) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [destinationUrl, setDestinationUrl] = useState("");
  const [fieldMappingJson, setFieldMappingJson] = useState("{}");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/engagements/${engagementId}/whop-agent/bridge-config`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load");
        if (cancelled) return;

        setDestinationUrl(data.destinationUrl ?? "");
        setFieldMappingJson(data.fieldMapping && Object.keys(data.fieldMapping).length ? JSON.stringify(data.fieldMapping, null, 2) : "{}");
      } catch (e: unknown) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [engagementId]);

  async function save() {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    let fieldMapping: Record<string, string> | undefined;
    try {
      fieldMapping = fieldMappingJson.trim() ? JSON.parse(fieldMappingJson) : undefined;
    } catch {
      setSaveError("Field mapping must be valid JSON.");
      setSaving(false);
      return;
    }
    try {
      const res = await fetch(`/api/engagements/${engagementId}/whop-agent/bridge-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destinationUrl, fieldMapping }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error ?? "Couldn't save. Nothing else was affected.");
        setSaving(false);
        return;
      }
      setSaving(false);
      setSaved(true);
      onSaved?.();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setSaveError(msg === "Failed to fetch" ? "Couldn't reach the server. Check your connection and try again." : msg);
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="p-6 text-xs font-mono" style={{ color: "var(--text-muted)" }}>Loading…</div>;
  }
  if (loadError) {
    return (
      <div className="p-6 text-xs font-mono font-semibold" style={{ color: "var(--error)" }}>
        ⚠ {loadError}
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full max-w-3xl mx-auto px-4 py-6" style={{ color: "var(--text-secondary)" }}>
      <div className="pb-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <h1 className="text-lg font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
          Configure Bridge Manager
        </h1>
        <p className="text-xs font-normal mt-0.5" style={{ color: "var(--text-muted)" }}>
          Where verified Whop webhook events get routed. Retries: 6 attempts over ~17 hours, dead-lettered after that.
        </p>
      </div>

      <InputField
        label="Destination URL"
        value={destinationUrl}
        onChange={setDestinationUrl}
        placeholder="https://your-crm.example.com/webhooks/whop"
        helpText="https only — this receives every verified Whop event this client's connection sees, in the agent's own envelope shape."
        required
      />
      <TextAreaField
        label="Field mapping (optional)"
        value={fieldMappingJson}
        onChange={setFieldMappingJson}
        rows={5}
        placeholder='{"membership_id": "external_id"}'
        helpText="Whop field name → your destination's field name, as JSON. Leave as {} to pass fields through unchanged."
      />

      {saveError && (
        <p className="text-xs font-mono font-semibold" style={{ color: "var(--error)" }}>
          ⚠ Error: {saveError}
        </p>
      )}
      {saved && !saveError && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 dark:border-emerald-900/70 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> Saved — live events will start routing there.
        </div>
      )}

      <div className="flex justify-between pt-4 font-mono" style={{ borderTop: "1px solid var(--border)" }}>
        <button
          onClick={onCancel}
          className="px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 shadow-xs"
        >
          {cancelLabel}
        </button>
        <button
          onClick={save}
          disabled={saving || !destinationUrl.trim()}
          className="px-5 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer bg-zinc-900 hover:bg-zinc-800 text-zinc-50 dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900 disabled:opacity-40 disabled:cursor-not-allowed shadow-xs active:translate-y-px"
        >
          {saving ? "Saving..." : "Save routing config"}
        </button>
      </div>
    </div>
  );
}
