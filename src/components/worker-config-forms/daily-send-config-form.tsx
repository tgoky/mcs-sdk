"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Loader2 } from "lucide-react";
import { InputField, SelectField } from "@/app/dashboard/engagements/new/form-fields";
import { ConfigFormSkeleton } from "./config-form-skeleton";
import { useToast } from "@/components/toast/toast-provider";
import { WorkerCapabilityMatrix } from "@/components/worker-capability-matrix";
import { ChoiceCardGroup } from "@/components/choice-card-group";
import { ProgressiveFlow, type ProgressiveFlowStep } from "@/components/progressive-flow";
import { BehaviorSummary } from "./behavior-summary";

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: `${h.toString().padStart(2, "0")}:00` }));

interface HeldLead {
  id: string;
  email: string;
  companyName: string;
  firstName: string | null;
  lastName: string | null;
  icp: string | null;
  createdAt: string;
  statusDetail: { reason?: string; copy?: { subject: string; body1: string } } | null;
}

/** Held-for-review queue — leads Daily Send set aside because their ICP is
 * review-required (see Send Connect's "Auto-push ICPs"). Before this
 * existed, a held lead had no UI anywhere: it just sat in the database
 * forever with no way to approve or discard it. */
function HeldLeadsPanel({ engagementId }: { engagementId: string }) {
  const [leads, setLeads] = useState<HeldLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (cancelledRef?: { current: boolean }) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/bridges/daily-send/held-leads`);
      const data = await res.json();
      if (cancelledRef?.current) return;
      if (res.ok) setLeads(data.leads ?? []);
    } finally {
      if (!cancelledRef?.current) setLoading(false);
    }
  }, [engagementId]);

  useEffect(() => {
    const cancelledRef = { current: false };
    load(cancelledRef);
    return () => {
      cancelledRef.current = true;
    };
  }, [load]);

  async function act(leadId: string, action: "approve" | "discard") {
    setBusyId(leadId);
    setError(null);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/bridges/daily-send/held-leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Action failed");
      setLeads((ls) => ls.filter((l) => l.id !== leadId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return null;
  if (leads.length === 0) return null;

  return (
    <div className="space-y-3 rounded-lg border border-amber-300 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20 p-3">
      <div>
        <h2 className="text-xs font-bold uppercase tracking-wide text-amber-800 dark:text-amber-300">
          Held for review ({leads.length})
        </h2>
        <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
          These ICPs are marked review-required in Send Connect. Approve to send now (respecting the live/dry-run setting above), or discard.
        </p>
      </div>
      {error && <p className="text-xs font-mono font-semibold text-rose-600 dark:text-rose-400">⚠ {error}</p>}
      <div className="space-y-2">
        {leads.map((lead) => (
          <div key={lead.id} className="flex items-center justify-between gap-3 rounded-lg bg-background border border-zinc-200 dark:border-zinc-800 px-3 py-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                {[lead.firstName, lead.lastName].filter(Boolean).join(" ") || lead.email} — {lead.companyName}
              </p>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                {lead.email} {lead.icp ? `· ${lead.icp}` : ""} {lead.statusDetail?.copy?.subject ? `· "${lead.statusDetail.copy.subject}"` : ""}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => act(lead.id, "approve")}
                disabled={busyId === lead.id}
                title="Approve & send"
                className="p-1.5 rounded-lg border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 disabled:opacity-40 cursor-pointer"
              >
                {busyId === lead.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              </button>
              <button
                type="button"
                onClick={() => act(lead.id, "discard")}
                disabled={busyId === lead.id}
                title="Discard"
                className="p-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DailySendConfigForm({ engagementId, onCancel, cancelLabel = "Close" }: { engagementId: string; onCancel: () => void; cancelLabel?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [buyer, setBuyer] = useState("");

  const [volume, setVolume] = useState("20");
  const [localHour, setLocalHour] = useState(9);
  const [timezone, setTimezone] = useState("UTC");
  const [copyMode, setCopyMode] = useState<"generate" | "upload">("upload");
  const [liveSendEnabled, setLiveSendEnabled] = useState(false);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/engagements/${engagementId}/bridges/daily-send`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load");
        if (cancelled) return;
        setBuyer(data.buyer ?? "");
        if (data.dailySendSettings) {
          setVolume(String(data.dailySendSettings.volume ?? 20));
          setLocalHour(data.dailySendSettings.localHour ?? 9);
          setTimezone(data.dailySendSettings.timezone ?? data.clientTimezone ?? "UTC");
          setCopyMode(data.dailySendSettings.copyMode ?? "upload");
          setLiveSendEnabled(Boolean(data.dailySendSettings.liveSendEnabled));
        } else if (data.clientTimezone) {
          setTimezone(data.clientTimezone);
        }
        setLastRunAt(data.lastRunAt ?? null);
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

  // Mirrors daily-send.ts's own validateDailySendInput bound (500/day) —
  // found by this session's audit: without this, the button stayed enabled
  // past the backend's real limit and the operator got a confusing server
  // error instead of an immediate client-side block.
  const canSubmit = Number(volume) > 0 && Number(volume) <= 500;

  async function handleSubmit() {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/bridges/daily-send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ volume: Number(volume), localHour, timezone: timezone.trim(), copyMode, liveSendEnabled }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setSaved(true);
      toast.success(`Daily Send settings saved${buyer ? ` for ${buyer}` : ""}.`);
      router.refresh();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <ConfigFormSkeleton />;
  if (loadError) return <div className="p-6 text-xs font-mono font-semibold text-rose-600 dark:text-rose-400">⚠ {loadError}</div>;

  const steps: ProgressiveFlowStep[] = [
    {
      id: "schedule",
      label: "Schedule",
      isComplete: Boolean(canSubmit),
      content: (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
          <InputField label="Daily volume" value={volume} onChange={setVolume} placeholder="20" required />
          <SelectField label="Send hour (client-local time)" value={String(localHour)} onChange={(v) => setLocalHour(Number(v))} options={HOUR_OPTIONS} />
          <InputField label="Timezone" value={timezone} onChange={setTimezone} placeholder="America/New_York" helpText="IANA timezone name. Defaults to UTC." />
        </div>
      ),
    },
    {
      id: "send-mode",
      label: "Send mode",
      isComplete: true,
      content: (
        <div className="space-y-4">
          <ChoiceCardGroup
            label="Copy mode"
            value={copyMode}
            onChange={(v) => setCopyMode(v as "generate" | "upload")}
            options={[
              { value: "upload", label: "Upload — rotate your own variants" },
              { value: "generate", label: "Generate — a fresh LLM draft per lead" },
            ]}
          />
          <label className="flex items-start gap-2 rounded-lg border border-zinc-200 dark:border-zinc-800 p-3 cursor-pointer">
            <input type="checkbox" checked={liveSendEnabled} onChange={(e) => setLiveSendEnabled(e.target.checked)} className="mt-0.5" />
            <span className="text-xs text-zinc-700 dark:text-zinc-300">
              <span className="font-bold">Send live.</span> Off by default — every run stays a dry run (leads fetched, copy assembled, nothing pushed to your ESP) until this is
              checked. Turn it on once you&apos;ve confirmed a dry run looks right.
            </span>
          </label>
          <HeldLeadsPanel engagementId={engagementId} />
        </div>
      ),
    },
  ];

  return (
    <div className="max-w-2xl mx-auto py-6 px-4 space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Daily Send{buyer ? ` — ${buyer}` : ""}</h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            The recurring pipeline: fetch, filter, personalize, push, report. {lastRunAt ? `Last ran ${new Date(lastRunAt).toLocaleString()}.` : "Hasn't run yet."}
          </p>
        </div>
        <button type="button" onClick={onCancel} className="shrink-0 text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 cursor-pointer">
          {cancelLabel}
        </button>
      </div>

      <WorkerCapabilityMatrix workerId="daily-send" engagementId={engagementId} />

      <BehaviorSummary
        lines={[
          `Up to ${volume || "0"} leads/day, sent at ${String(localHour).padStart(2, "0")}:00 ${timezone || "UTC"}.`,
          copyMode === "generate" ? "Copy is freshly generated per lead by an LLM call." : "Copy rotates through your uploaded subject/body variants.",
          liveSendEnabled ? "Live sending is ON — real emails will go out." : "Live sending is OFF — every run stays a dry run until this is turned on.",
        ]}
      />

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
