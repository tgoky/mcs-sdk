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

import { useEffect, useState } from "react";
import { FactSuggestionChip, type FactSuggestionDTO } from "@/components/fact-suggestion";
import { CredentialRow } from "@/app/dashboard/engagements/[id]/update-credentials-form";
import { InputField } from "@/app/dashboard/engagements/new/form-fields";
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
  const [suggestions, setSuggestions] = useState<Record<string, FactSuggestionDTO>>({});
  const [twilioCampaignStatus, setTwilioCampaignStatus] = useState<string | null>(null);
  const [smsMeta, setSmsMeta] = useState({ twilio_account_sid: "", twilio_messaging_service_sid: "", twilio_from_number: "", ghl_location_id: "" });
  const setMeta = (key: keyof typeof smsMeta) => (value: string) => setSmsMeta((m) => ({ ...m, [key]: value }));

  // Load what's actually saved: a channel that was never chosen starts
  // unselected rather than looking like "none" was picked, and the
  // connected tools' suggestions are shown beside each choice.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/engagements/${engagementId}/workers/pile-on/enable-with-config`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setSmsPlatform(data.smsPlatform ?? "");
        setAdDataPlatform(data.adDataPlatform ?? "");
        setSuggestions(data.suggestions ?? {});
        if (data.smsPlatformMeta) setSmsMeta((m) => ({ ...m, ...data.smsPlatformMeta }));
        setTwilioCampaignStatus(typeof data.twilioCampaignStatus === "string" ? data.twilioCampaignStatus : null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [engagementId]);

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/workers/pile-on/enable-with-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ smsPlatform, adDataPlatform, smsPlatformMeta: smsMeta }),
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
      isComplete: Boolean(smsPlatform),
      content: (
        <div className="space-y-1">
          <ChoiceCardGroup
            label="SMS follow-ups"
            value={smsPlatform}
            onChange={setSmsPlatform}
            options={SMS_OPTIONS}
            helpText='Selecting "none" turns this channel back off.'
          />
          {smsPlatform && smsPlatform !== "none" && (
            // One key per chosen platform, saved under the platform's own
            // name — that's the key the SMS senders read.
            <CredentialRow engagementId={engagementId} provider={smsPlatform} label={`${SMS_PLATFORM_LABELS[smsPlatform as keyof typeof SMS_PLATFORM_LABELS] ?? smsPlatform} key`} />
          )}
          {smsPlatform === "twilio" && twilioCampaignStatus === "FAILED" && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-400">
              Twilio rejected this client&apos;s A2P 10DLC campaign, so SMS can&apos;t send. Fix and resubmit the campaign in Twilio,
              then save here again to re-check.
            </div>
          )}
          {smsPlatform === "twilio" && twilioCampaignStatus === "IN_PROGRESS" && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-400">
              Twilio is still reviewing this client&apos;s A2P 10DLC campaign; SMS sends once it&apos;s approved.
            </div>
          )}
          {smsPlatform === "twilio" && (
            <div className="space-y-2">
              <InputField label="Twilio Account SID" value={smsMeta.twilio_account_sid} onChange={setMeta("twilio_account_sid")} placeholder="AC…" required />
              <InputField
                label="Messaging Service SID"
                value={smsMeta.twilio_messaging_service_sid}
                onChange={setMeta("twilio_messaging_service_sid")}
                placeholder="MG…"
                helpText="Needed to check your A2P 10DLC campaign status, and to send from a pool of numbers."
              />
              <InputField
                label="From number (if no Messaging Service)"
                value={smsMeta.twilio_from_number}
                onChange={setMeta("twilio_from_number")}
                placeholder="+15550000000"
              />
            </div>
          )}
          {smsPlatform === "ghl_sms" && (
            <InputField label="GoHighLevel location ID" value={smsMeta.ghl_location_id} onChange={setMeta("ghl_location_id")} required />
          )}
          <FactSuggestionChip
            engagementId={engagementId}
            factKey="smsPlatform"
            suggestion={smsPlatform ? undefined : suggestions.smsPlatform}
            currentValue={smsPlatform}
            display={(v) => SMS_PLATFORM_LABELS[String(v) as keyof typeof SMS_PLATFORM_LABELS] ?? String(v)}
            onUse={(v) => setSmsPlatform(String(v))}
          />
        </div>
      ),
    },
    {
      id: "ad-data",
      label: "Ad-data sync",
      isComplete: Boolean(adDataPlatform),
      content: (
        <div className="space-y-1">
          <ChoiceCardGroup
            label="Ad-data cohort sync"
            value={adDataPlatform}
            onChange={setAdDataPlatform}
            options={AD_DATA_OPTIONS}
            helpText='Selecting "none" turns this channel back off. Finer setup continues from Edit Stack Settings.'
          />
          {adDataPlatform && adDataPlatform !== "none" && adDataPlatform !== "native_crm" && (
            <CredentialRow
              engagementId={engagementId}
              provider={adDataPlatform}
              label={`${AD_DATA_PLATFORM_LABELS[adDataPlatform as keyof typeof AD_DATA_PLATFORM_LABELS] ?? adDataPlatform} key`}
            />
          )}
          <FactSuggestionChip
            engagementId={engagementId}
            factKey="adDataPlatform"
            suggestion={adDataPlatform ? undefined : suggestions.adDataPlatform}
            currentValue={adDataPlatform}
            display={(v) => AD_DATA_PLATFORM_LABELS[String(v) as keyof typeof AD_DATA_PLATFORM_LABELS] ?? String(v)}
            onUse={(v) => setAdDataPlatform(String(v))}
          />
        </div>
      ),
    },
  ];

  // Real, live translation of the 2 choices above — pile-on has nothing
  // to preview (no rendered artifact), so this states the actual
  // consequence instead, computed from current state, not invented.
  const summaryLines: string[] = [
    !smsPlatform
      ? "SMS follow-ups: not chosen yet."
      : smsPlatform === "none"
      ? "SMS follow-ups are off — no text messages will be sent."
      : `New leads matching your ICPs will get SMS follow-ups via ${SMS_PLATFORM_LABELS[smsPlatform as keyof typeof SMS_PLATFORM_LABELS] ?? smsPlatform}.`,
    !adDataPlatform
      ? "Ad-data cohort sync: not chosen yet."
      : adDataPlatform === "none"
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

      <ProgressiveFlow steps={steps} onFinish={save} finishLabel="Save changes" finishDisabled={saving || !smsPlatform || !adDataPlatform} finishing={saving} />

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
