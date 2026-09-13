"use client";

// Without this, whop-cancellation-save-offer can be toggled on and never
// do anything: src/inngest/whop-agent.ts's membership.cancel_at_period_end_changed
// handler bails out silently unless discount/duration/message are all set
// on this engagement's stack, and nothing else in the app ever set them.

import { useEffect, useState } from "react";
import { InputField, TextAreaField } from "@/app/dashboard/engagements/new/form-fields";

export function WhopCancellationSaveOfferConfigForm({
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

  const [discountPercentage, setDiscountPercentage] = useState("");
  const [durationMonths, setDurationMonths] = useState("");
  const [message, setMessage] = useState("");
  const [minTenureDays, setMinTenureDays] = useState("");
  const [cooldownDays, setCooldownDays] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/engagements/${engagementId}/whop-agent/save-offer-config`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load");
        if (cancelled) return;

        setDiscountPercentage(data.discountPercentage != null ? String(data.discountPercentage) : "");
        setDurationMonths(data.durationMonths != null ? String(data.durationMonths) : "");
        setMessage(data.message ?? "");
        setMinTenureDays(data.minTenureDays != null ? String(data.minTenureDays) : "");
        setCooldownDays(data.cooldownDays != null ? String(data.cooldownDays) : "");
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
    try {
      const res = await fetch(`/api/engagements/${engagementId}/whop-agent/save-offer-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          discountPercentage: Number(discountPercentage),
          durationMonths: Number(durationMonths),
          message,
          minTenureDays: minTenureDays.trim() ? Number(minTenureDays) : undefined,
          cooldownDays: cooldownDays.trim() ? Number(cooldownDays) : undefined,
        }),
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

  const canSave = discountPercentage.trim() !== "" && durationMonths.trim() !== "" && message.trim() !== "";

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
          Configure Cancellation Save-Offer
        </h1>
        <p className="text-xs font-normal mt-0.5" style={{ color: "var(--text-muted)" }}>
          This skill is a no-op until every field below (except the two overrides) is set — every genuine cancel-intent
          event just gets logged and dropped otherwise. Whop&apos;s native cancel-discount itself is configured separately,
          from the plan settings step.
        </p>
      </div>

      <InputField
        label="Discount percentage"
        value={discountPercentage}
        onChange={setDiscountPercentage}
        type="number"
        placeholder="20"
        helpText="How much off the save offer proposes when a member starts cancelling — a whole number, 1-100."
        required
      />
      <InputField
        label="Duration (months)"
        value={durationMonths}
        onChange={setDurationMonths}
        type="number"
        placeholder="3"
        helpText="How many billing cycles the discount applies for once accepted."
        required
      />
      <TextAreaField
        label="Offer message"
        value={message}
        onChange={setMessage}
        rows={3}
        placeholder="Before you go — stay for {months} more month(s) at {discount}% off?"
        helpText="Supports {discount} and {months} template tokens. Every offer needs operator approval before it's ever shown — this is the copy that approval will see."
        required
      />
      <InputField
        label="Minimum tenure (days)"
        value={minTenureDays}
        onChange={setMinTenureDays}
        type="number"
        placeholder="Defaults to 30"
        helpText="A member cancelling before they've been subscribed this long never gets a save offer — leave blank to use the default (30 days)."
      />
      <InputField
        label="Cooldown (days)"
        value={cooldownDays}
        onChange={setCooldownDays}
        type="number"
        placeholder="Defaults to 90"
        helpText="How long after one save offer before the same member can be offered another — leave blank to use the default (90 days)."
      />

      {saveError && (
        <p className="text-xs font-mono font-semibold" style={{ color: "var(--error)" }}>
          ⚠ Error: {saveError}
        </p>
      )}
      {saved && !saveError && (
        <p className="text-xs font-mono font-semibold" style={{ color: "var(--text-muted)" }}>
          ✓ Saved.
        </p>
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
          disabled={saving || !canSave}
          className="px-5 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer bg-zinc-900 hover:bg-zinc-800 text-zinc-50 dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900 disabled:opacity-40 disabled:cursor-not-allowed shadow-xs active:translate-y-px"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
