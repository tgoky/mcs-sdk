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
import { SMS_PLATFORM_LABELS, AD_DATA_PLATFORM_LABELS, skillName } from "@/lib/copy";
import { WorkerCapabilityMatrix } from "@/components/worker-capability-matrix";
import { ChoiceCardGroup } from "@/components/choice-card-group";
import { ProgressiveFlow, type ProgressiveFlowStep } from "@/components/progressive-flow";
import { BehaviorSummary } from "./behavior-summary";

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

  // 2 steps mirroring this worker's own 2 capabilities (SMS Follow-ups /
  // Ad-Cohort Sync, worker-registry.ts's WORKER_CAPABILITIES entry) —
  // narrating each channel's own choice separately instead of a flat
  // 2-field stack, same treatment every other configured worker gets.
  const steps: ProgressiveFlowStep[] = [
    {
      id: "sms",
      label: "SMS follow-ups",
      isComplete: true,
      content: (
        <ChoiceCardGroup
          label="SMS follow-ups"
          value={smsPlatform}
          onChange={setSmsPlatform}
          options={SMS_OPTIONS}
          helpText='Selecting "none" turns this channel back off.'
        />
      ),
    },
    {
      id: "ad-data",
      label: "Ad-data sync",
      isComplete: true,
      content: (
        <ChoiceCardGroup
          label="Ad-data cohort sync"
          value={adDataPlatform}
          onChange={setAdDataPlatform}
          options={AD_DATA_OPTIONS}
          helpText='Selecting "none" turns this channel back off. Finer setup continues from Edit Stack Settings.'
        />
      ),
    },
  ];

  // Real, live translation of the 2 choices above — pile-on has nothing
  // to preview (no rendered artifact), so this states the actual
  // consequence instead, computed from current state, not invented.
  const summaryLines: string[] = [
    smsPlatform === "none"
      ? "SMS follow-ups are off — no text messages will be sent."
      : `New leads matching your ICPs will get SMS follow-ups via ${SMS_PLATFORM_LABELS[smsPlatform as keyof typeof SMS_PLATFORM_LABELS] ?? smsPlatform}.`,
    adDataPlatform === "none"
      ? "Ad-data cohort sync is off — leads won't be pushed to an ad platform."
      : `Leads will also be synced to ${AD_DATA_PLATFORM_LABELS[adDataPlatform as keyof typeof AD_DATA_PLATFORM_LABELS] ?? adDataPlatform} for ad-cohort targeting.`,
  ];

  return (
    <div className="space-y-4 w-full max-w-md">
      <div className="pb-2.5 border-b border-zinc-200 dark:border-zinc-800">
        <h2 className="text-sm font-bold text-zinc-900 dark:text-white">Configure {skillName("pile-on")}</h2>
      </div>

      <WorkerCapabilityMatrix workerId="pile-on" engagementId={engagementId} />

      <BehaviorSummary lines={summaryLines} />

      <ProgressiveFlow steps={steps} onFinish={save} finishLabel="Save changes" finishDisabled={saving} finishing={saving} />

      {saveError && <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">⚠ {saveError}</p>}

      <div className="flex justify-end pt-2 border-t border-zinc-200 dark:border-zinc-800">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white cursor-pointer disabled:opacity-40"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
