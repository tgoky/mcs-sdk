"use client";

// Extracted from this directory's page.tsx so the same form can render
// either as its own full route (bookmarkable, linked from elsewhere) or
// inline wherever a worker's Configure action is clicked on a page that
// already shows every worker for this client (WorkersPanel, the Library
// grid) — matching the same "expand in place, don't navigate away just to
// see a form" pattern OverviewStatsPanel's own Tasks/Issues tiles already
// use on the dashboard. onCancel/onSaved let each caller decide what
// "close" and "saved" mean for its own context (navigate back vs. just
// collapse); the form itself only knows how to load, edit, and save.

import { useEffect, useState } from "react";
import { InputField, SelectField } from "@/app/dashboard/engagements/new/form-fields";
import { ConfigFormSkeleton } from "./config-form-skeleton";
import { WorkerCapabilityMatrix } from "@/components/worker-capability-matrix";
import { ChoiceCardGroup } from "@/components/choice-card-group";
import { ProgressiveFlow, type ProgressiveFlowStep } from "@/components/progressive-flow";
import { LeakMapLivePreview } from "./leak-map-live-preview";
import { FactSuggestionChip, type FactSuggestionDTO } from "@/components/fact-suggestion";

const DAY_OPTIONS = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
];
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: `${h.toString().padStart(2, "0")}:00` }));
const DAY_OF_MONTH_OPTIONS = Array.from({ length: 28 }, (_, d) => ({ value: String(d + 1), label: String(d + 1) }));

export function LeakMapConfigForm({
  engagementId,
  onCancel,
  cancelLabel = "Back to client",
}: {
  engagementId: string;
  onCancel: () => void;
  cancelLabel?: string;
}) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [buyer, setBuyer] = useState("");
  const [slackWebhookUrl, setSlackWebhookUrl] = useState("");

  const [weeklyScheduleDayOfWeek, setWeeklyScheduleDayOfWeek] = useState(1);
  const [weeklyScheduleHour, setWeeklyScheduleHour] = useState(9);
  const [monthlyScheduleDayOfMonth, setMonthlyScheduleDayOfMonth] = useState(1);
  const [leakMapTimezone, setLeakMapTimezone] = useState("UTC");
  const [auditOutputFormat, setAuditOutputFormat] = useState<"email" | "slack" | "dashboard_only">("dashboard_only");
  const [leakMapReportEmail, setLeakMapReportEmail] = useState("");
  const [suggestions, setSuggestions] = useState<Record<string, FactSuggestionDTO>>({});

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/engagements/${engagementId}/bridges/leak-map`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load");
        if (cancelled) return;

        setBuyer(data.buyer ?? "");
        setSlackWebhookUrl(data.slackWebhookUrl ?? "");
        setWeeklyScheduleDayOfWeek(data.weeklyScheduleDayOfWeek ?? 1);
        setWeeklyScheduleHour(data.weeklyScheduleHour ?? 9);
        setMonthlyScheduleDayOfMonth(data.monthlyScheduleDayOfMonth ?? 1);
        setLeakMapTimezone(data.leakMapTimezone ?? "UTC");
        setAuditOutputFormat(data.auditOutputFormat ?? "dashboard_only");
        setLeakMapReportEmail(data.leakMapReportEmail ?? "");
        setSuggestions(data.suggestions ?? {});
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

  const canSubmit = auditOutputFormat !== "email" || leakMapReportEmail.trim().length > 0;

  async function save() {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/bridges/leak-map`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weeklyScheduleDayOfWeek,
          weeklyScheduleHour,
          monthlyScheduleDayOfMonth,
          leakMapTimezone,
          auditOutputFormat,
          leakMapReportEmail,
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
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Unknown error";
      setSaveError(message === "Failed to fetch" ? "Couldn't reach the server. Check your connection and try again." : message);
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

  const steps: ProgressiveFlowStep[] = [
    {
      id: "schedule",
      label: "Schedule",
      isComplete: true,
      content: (
        <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
          <SelectField
            label="Weekly summary — day"
            value={String(weeklyScheduleDayOfWeek)}
            onChange={(v) => setWeeklyScheduleDayOfWeek(Number(v))}
            options={DAY_OPTIONS}
          />
          <SelectField
            label="Report hour (local)"
            value={String(weeklyScheduleHour)}
            onChange={(v) => setWeeklyScheduleHour(Number(v))}
            options={HOUR_OPTIONS}
            helpText="Used for both the weekly summary and monthly deep-dive."
          />
          <SelectField
            label="Monthly deep-dive — day of month"
            value={String(monthlyScheduleDayOfMonth)}
            onChange={(v) => setMonthlyScheduleDayOfMonth(Number(v))}
            options={DAY_OF_MONTH_OPTIONS}
            helpText="Capped at 28 so it fires reliably every month, including February."
          />
          <InputField
            label="Timezone"
            value={leakMapTimezone}
            onChange={setLeakMapTimezone}
            placeholder="America/New_York"
            helpText="IANA timezone name. Defaults to UTC."
          />
        </div>
      ),
    },
    {
      id: "delivery",
      label: "Report delivery",
      isComplete: Boolean(canSubmit),
      content: (
        <div className="space-y-4">
          <ChoiceCardGroup
            label="Report delivery"
            value={auditOutputFormat}
            onChange={(v) => setAuditOutputFormat(v as "email" | "slack" | "dashboard_only")}
            options={[
              { value: "dashboard_only", label: "Dashboard only" },
              { value: "slack", label: "Slack" },
              { value: "email", label: "Email" },
            ]}
          />
          {auditOutputFormat === "email" && (
            <InputField
              label="Report recipient email"
              value={leakMapReportEmail}
              onChange={setLeakMapReportEmail}
              placeholder="ops@client.com"
              required
            />
          )}
          {auditOutputFormat === "email" && (
            <FactSuggestionChip
              engagementId={engagementId}
              factKey="leakMapReportEmail"
              suggestion={suggestions.leakMapReportEmail}
              currentValue={leakMapReportEmail}
              onUse={(v) => setLeakMapReportEmail(String(v))}
            />
          )}
          {auditOutputFormat === "slack" && !slackWebhookUrl && (
            <div
              className="rounded-lg p-3 text-xs shadow-xs font-mono font-medium"
              style={{ background: "var(--accent-dim)", color: "var(--text-secondary)" }}
            >
              Slack delivery uses the Slack webhook URL from Pre-Call Read&apos;s brief settings — add one there if you
              haven&apos;t yet.
            </div>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 w-full max-w-3xl mx-auto px-4 py-6" style={{ color: "var(--text-secondary)" }}>
      <div className="pb-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <h1 className="text-lg font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
          Configure Leak Map{buyer ? ` for ${buyer}` : ""}
        </h1>
        <p className="text-xs font-normal mt-0.5" style={{ color: "var(--text-muted)" }}>
          These already have sane defaults — Leak Map runs fine without ever opening this screen. Come back anytime
          to change the audit schedule or where reports land.
        </p>
      </div>

      <WorkerCapabilityMatrix workerId="leak-map" engagementId={engagementId} />

      <LeakMapLivePreview engagementId={engagementId} />

      <ProgressiveFlow steps={steps} onFinish={save} finishLabel="Save" finishDisabled={saving || !canSubmit} finishing={saving} />

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
