"use client";

// src/components/worker-config-forms/pile-on-config-form.tsx
//
// Pile-On has no "hinges panel" (worker.hasHingesPanel is false in
// skill-manifest.ts) so it never got a Configure form here like the other
// four skills — its only settings UI was EnablePileOnModal, a full modal
// with an "Enable Pile-On"/"Ask Teammates" tab switcher built for the
// Library's first-time enable flow. Dropping that modal (and the chat
// tab it could land on and immediately start a conversation from) in
// favor of the same plain dropdown form every other skill's Configure
// button already opens — two fields, Save/Cancel, nothing else. Posts to
// the same enable-with-config endpoint the Library flow uses; re-calling
// it for an already-enabled worker is a no-op on the enable side, it
// just updates the two stack fields.

import { useState } from "react";
import { SelectField } from "@/app/dashboard/engagements/new/form-fields";
import { SMS_PLATFORM_LABELS, AD_DATA_PLATFORM_LABELS, skillName } from "@/lib/copy";

const SMS_OPTIONS = Object.entries(SMS_PLATFORM_LABELS).map(([value, label]) => ({ value, label }));
const AD_DATA_OPTIONS = Object.entries(AD_DATA_PLATFORM_LABELS).map(([value, label]) => ({ value, label }));

export function PileOnConfigForm({
  engagementId,
  initialSmsPlatform,
  initialAdDataPlatform,
  onCancel,
  onSaved,
}: {
  engagementId: string;
  initialSmsPlatform: string;
  initialAdDataPlatform: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [smsPlatform, setSmsPlatform] = useState(initialSmsPlatform);
  const [adDataPlatform, setAdDataPlatform] = useState(initialAdDataPlatform);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/workers/pile-on/enable-with-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ smsPlatform, adDataPlatform }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "Couldn't save. Nothing else was affected.");
      onSaved();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Unknown error");
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 w-full max-w-sm">
      <div className="pb-2.5 border-b border-zinc-200 dark:border-zinc-800">
        <h2 className="text-sm font-bold text-zinc-900 dark:text-white">Configure {skillName("pile-on")}</h2>
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
          Selecting &quot;none&quot; turns that channel back off. Finer setup continues from Edit Stack Settings.
        </p>
      </div>

      <SelectField label="SMS follow-ups" value={smsPlatform} onChange={setSmsPlatform} options={SMS_OPTIONS} />
      <SelectField label="Ad-data cohort sync" value={adDataPlatform} onChange={setAdDataPlatform} options={AD_DATA_OPTIONS} />

      {saveError && <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">⚠ {saveError}</p>}

      <div className="flex justify-end gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white cursor-pointer disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-zinc-900 dark:bg-white px-3.5 py-1.5 text-xs font-semibold text-white dark:text-zinc-900 hover:opacity-90 disabled:opacity-40 cursor-pointer"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
