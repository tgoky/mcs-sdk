"use client";

// Review requests' own settings (features/reputation-manager/server/
// review-requests.ts): the client's review link, the message, the wait, and
// email or text first. Loads and saves on its own, so it can sit inside
// Reputation's setup without joining that screen's identity save.

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { renderReviewRequest } from "@/features/reputation-manager/server/review-request-message";

interface Settings {
  link: string;
  message: string | null;
  subject: string | null;
  delayHours: number | null;
  channel: "email" | "sms";
  defaults: { message: string; subject: string; delayHours: number };
  reach: { email: boolean; sms: boolean };
  last30Days: Record<string, number>;
}

function isSettings(v: unknown): v is Settings {
  const o = v as Partial<Settings> | null;
  return Boolean(o && typeof o.link === "string" && o.defaults && typeof o.defaults.message === "string" && o.reach && o.last30Days);
}

const inputCls =
  "w-full rounded-lg border border-[var(--border)] bg-background px-3 text-sm outline-none placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-[var(--ring)]/40";

export function ReviewRequestSettings({ engagementId }: { engagementId: string }) {
  const [data, setData] = useState<Settings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState({ link: "", message: "", subject: "", delayHours: "", channel: "email" as "email" | "sms" });
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/engagements/${encodeURIComponent(engagementId)}/reputation/review-requests`, { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!live) return;
        if (!res.ok) return setLoadError(body.error ?? "Couldn't load review request settings.");
        if (!isSettings(body)) return setLoadError("Couldn't load review request settings.");
        const s = body;
        setData(s);
        setDraft({ link: s.link, message: s.message ?? "", subject: s.subject ?? "", delayHours: s.delayHours == null ? "" : String(s.delayHours), channel: s.channel });
      })
      .catch(() => live && setLoadError("Couldn't load review request settings."));
    return () => {
      live = false;
    };
  }, [engagementId]);

  if (loadError) return <p className="text-[13px] text-rose-600 dark:text-rose-400">{loadError}</p>;
  if (!data) return <p className="text-[13px] text-[var(--text-muted)]">Loading review requests…</p>;

  const message = draft.message.trim() || data.defaults.message;
  const preview = renderReviewRequest(message, "Sam Lee", draft.link.trim() || "(your review link)");
  const sent = data.last30Days.sent ?? 0;
  const skipped = data.last30Days.skipped ?? 0;
  const noReach = !data.reach.email && !data.reach.sms;

  async function save() {
    setSaving(true);
    setNote(null);
    try {
      const res = await fetch(`/api/engagements/${encodeURIComponent(engagementId)}/reputation/review-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ link: draft.link, message: draft.message || null, subject: draft.subject || null, delayHours: draft.delayHours === "" ? null : Number(draft.delayHours), channel: draft.channel }),
      });
      const body = await res.json().catch(() => ({}));
      setNote(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: body.error ?? "Couldn't save." });
    } catch {
      setNote({ ok: false, text: "Couldn't save." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-[13px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">Review requests</h2>
        <p className="text-[13px] leading-relaxed text-[var(--text-secondary)]">
          Everyone who shows up to a call or pays gets the same message with your review link. We don&apos;t filter by how they feel: asking only happy customers breaks Google&apos;s review rules. One ask per person every 90 days.
        </p>
        {(sent > 0 || skipped > 0) && (
          <p className="text-[12px] text-[var(--text-muted)]">
            Last 30 days: {sent} sent{skipped ? `, ${skipped} not sent (already asked, opted out, or no way to reach them)` : ""}.
          </p>
        )}
      </div>

      {noReach && (
        <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-[12px] text-amber-700 dark:text-amber-300">
          Connect an email sender (SMTP or Resend) or a texting tool (Twilio or GoHighLevel) first. Without one, nothing can be sent.
        </p>
      )}

      <label className="block space-y-1.5">
        <span className="text-[12px] font-medium text-[var(--text-secondary)]">Your review link</span>
        <input className={`${inputCls} h-9`} value={draft.link} onChange={(e) => setDraft((d) => ({ ...d, link: e.target.value }))} placeholder="https://g.page/r/…/review" aria-label="Review link" />
        <span className="block text-[12px] text-[var(--text-muted)]">In Google Business Profile, choose &quot;Ask for reviews&quot; and copy the link. Any review page works.</span>
      </label>

      <label className="block space-y-1.5">
        <span className="text-[12px] font-medium text-[var(--text-secondary)]">Message</span>
        <textarea rows={3} maxLength={600} className={`${inputCls} resize-y py-2 leading-relaxed`} value={draft.message || data.defaults.message} onChange={(e) => setDraft((d) => ({ ...d, message: e.target.value === data.defaults.message ? "" : e.target.value }))} aria-label="Review request message" />
        <span className="block text-[12px] text-[var(--text-muted)]">You can use {"{name}"} and {"{link}"}. Preview: {preview}</span>
      </label>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="block space-y-1.5 sm:col-span-1">
          <span className="text-[12px] font-medium text-[var(--text-secondary)]">Email subject</span>
          <input className={`${inputCls} h-9`} value={draft.subject} onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))} placeholder={data.defaults.subject} aria-label="Email subject" />
        </label>
        <label className="block space-y-1.5">
          <span className="text-[12px] font-medium text-[var(--text-secondary)]">Wait (hours)</span>
          <input className={`${inputCls} h-9`} inputMode="numeric" value={draft.delayHours} onChange={(e) => setDraft((d) => ({ ...d, delayHours: e.target.value.replace(/[^0-9]/g, "") }))} placeholder={String(data.defaults.delayHours)} aria-label="Hours to wait" />
        </label>
        <label className="block space-y-1.5">
          <span className="text-[12px] font-medium text-[var(--text-secondary)]">Try first</span>
          <select className={`${inputCls} h-9`} value={draft.channel} onChange={(e) => setDraft((d) => ({ ...d, channel: e.target.value === "sms" ? "sms" : "email" }))} aria-label="Channel to try first">
            <option value="email">Email{data.reach.email ? "" : " (not connected)"}</option>
            <option value="sms">Text{data.reach.sms ? "" : " (not connected)"}</option>
          </select>
        </label>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className={note ? (note.ok ? "text-[12px] text-emerald-600 dark:text-emerald-400" : "text-[12px] text-rose-600 dark:text-rose-400") : "text-[12px] text-[var(--text-muted)]"}>
          {note?.text ?? (draft.link.trim() ? "" : "Nothing is sent until a review link is saved.")}
        </p>
        <button type="button" onClick={save} disabled={saving} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--ink)] px-3 text-[13px] font-medium text-[var(--ink-foreground)] disabled:opacity-60 cursor-pointer">
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Save review requests
        </button>
      </div>
    </section>
  );
}
