"use client";

// Shared by workers-panel.tsx / product-detail-client.tsx's inline
// Configure expand AND the dedicated whop-bridge-manager page's console
// (bridge-manager-console.tsx) — was two copies of the same destination-
// URL/field-mapping form before this, one of them (the console) missing a
// GET entirely and unable to show what was already saved.

import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { InputField, TextAreaField } from "@/app/dashboard/engagements/new/form-fields";
import { ConfigFormSkeleton } from "./config-form-skeleton";
import { ProgressiveFlow, type ProgressiveFlowStep } from "@/components/progressive-flow";
import { WorkerCapabilityMatrix } from "@/components/worker-capability-matrix";
import { BehaviorSummary } from "./behavior-summary";

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
    return <ConfigFormSkeleton />;
  }
  if (loadError) {
    return (
      <div className="p-6 text-xs font-mono font-semibold" style={{ color: "var(--error)" }}>
        ⚠ {loadError}
      </div>
    );
  }

  // 2 fields is small, but narrating "the required decision" separately
  // from "the optional refinement" is the same treatment every other
  // configured worker now gets — not skipped just because the field
  // count is low.
  const steps: ProgressiveFlowStep[] = [
    {
      id: "destination",
      label: "Destination",
      isComplete: destinationUrl.trim() !== "",
      content: (
        <InputField
          label="Destination URL"
          value={destinationUrl}
          onChange={setDestinationUrl}
          placeholder="https://your-crm.example.com/webhooks/whop"
          helpText="https only — this receives every verified Whop event this client's connection sees, in the agent's own envelope shape."
          required
        />
      ),
    },
    {
      id: "field-mapping",
      label: "Field mapping",
      isComplete: true,
      content: (
        <TextAreaField
          label="Field mapping (optional)"
          value={fieldMappingJson}
          onChange={setFieldMappingJson}
          rows={5}
          placeholder='{"membership_id": "external_id"}'
          helpText="Whop field name → your destination's field name, as JSON. Leave as {} to pass fields through unchanged."
        />
      ),
    },
  ];

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

      <WorkerCapabilityMatrix workerId="whop-bridge-manager" engagementId={engagementId} />

      <BehaviorSummary
        lines={[
          destinationUrl.trim()
            ? `Every verified Whop event this connection sees routes to ${destinationUrl.trim()}.`
            : "No destination set — nothing routes anywhere yet.",
          (() => {
            try {
              const parsed = fieldMappingJson.trim() ? JSON.parse(fieldMappingJson) : {};
              const n = Object.keys(parsed).length;
              return n === 0 ? "Fields pass through unchanged (identity mapping)." : `${n} field${n === 1 ? "" : "s"} renamed before delivery, everything else passes through unchanged.`;
            } catch {
              return "Field mapping isn't valid JSON yet — fix it before saving, or leave it as {} to pass fields through unchanged.";
            }
          })(),
          "Retries: 6 attempts over ~17 hours, dead-lettered after that.",
        ]}
      />

      <ProgressiveFlow steps={steps} onFinish={save} finishLabel="Save routing config" finishDisabled={saving || !destinationUrl.trim()} finishing={saving} />

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

      <div className="flex justify-end pt-4 font-mono" style={{ borderTop: "1px solid var(--border)" }}>
        <button
          onClick={onCancel}
          className="px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 shadow-xs"
        >
          {cancelLabel}
        </button>
      </div>
    </div>
  );
}
