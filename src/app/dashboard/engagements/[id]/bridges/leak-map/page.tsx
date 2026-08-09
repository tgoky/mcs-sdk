"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { InputField, SelectField } from "../../../new/form-fields";

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

export default function LeakMapBridgePage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();

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

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/engagements/${id}/bridges/leak-map`);
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
      } catch (e: unknown) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const canSubmit = auditOutputFormat !== "email" || leakMapReportEmail.trim().length > 0;

  async function save() {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/engagements/${id}/bridges/leak-map`, {
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
          Configure Leak Map{buyer ? ` for ${buyer}` : ""}
        </h1>
        <p className="text-xs font-normal mt-0.5" style={{ color: "var(--text-muted)" }}>
          These already have sane defaults — Leak Map runs fine without ever opening this screen. Come back anytime
          to change the audit schedule or where reports land.
        </p>
      </div>

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
        <SelectField
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
      </div>
      {auditOutputFormat === "slack" && !slackWebhookUrl && (
        <div
          className="rounded-lg p-3 text-xs shadow-xs font-mono font-medium"
          style={{ background: "var(--accent-dim)", color: "var(--text-secondary)" }}
        >
          Slack delivery uses the Slack webhook URL from Pre-Call Read&apos;s brief settings — add one there if you
          haven&apos;t yet.
        </div>
      )}

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
          onClick={() => router.push(`/dashboard/engagements/${id}`)}
          className="px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 shadow-xs"
        >
          Back to engagement
        </button>
        <button
          onClick={save}
          disabled={saving || !canSubmit}
          className="px-5 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer bg-zinc-900 hover:bg-zinc-800 text-zinc-50 dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900 disabled:opacity-40 disabled:cursor-not-allowed shadow-xs active:translate-y-px"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
