"use client";

// src/components/product-setup/showtime-skill-settings.tsx
//
// One Showtime skill's own settings: Pile-On, Win-Back, Call Brief
// (pre-call-read) and Funnel Audit (leak-map). Built from the same pieces as
// every product's setup review (review-kit.tsx): a header, one row per
// setting saying what it is now, Change opening a small editor in place,
// and one Save that stays off until something changed. Show Rate Setup
// (pin-down) has its own, inside ShowtimeSetup.
//
// Each skill still loads from and saves to its own existing route (the
// bridge or enable-with-config route its old step form used), with the
// same body, so what's stored and how the skill runs are unchanged. The
// tools a skill runs on (booking, email) are shared across Showtime, so
// they're changed in the full setup, linked from the header.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Copy } from "lucide-react";
import { AnySkillBadge } from "@/components/any-skill-badge";
import { CredentialRow } from "@/app/dashboard/engagements/[id]/update-credentials-form";
import { anySkillDisplayName } from "@/lib/any-skill";
import { SMS_PLATFORM_LABELS, AD_DATA_PLATFORM_LABELS } from "@/lib/copy";
import { ApproveBar, FeedRow, Labeled, SettingsHeader, inputCls, type FeedEntry } from "./review-kit";
import { ChoiceList } from "./fact-token";
import { BackButton } from "./back-button";

export const SHOWTIME_SETTINGS_SKILLS = ["pile-on", "win-back", "pre-call-read", "leak-map"] as const;
export type ShowtimeSettingsSkill = (typeof SHOWTIME_SETTINGS_SKILLS)[number];

const ABOUT: Record<ShowtimeSettingsSkill, string> = {
  "pile-on": "Warm-up texts and ad audiences between a booking and the call.",
  "win-back": "A rebooking sequence for anyone who no-shows. It runs on its defaults; change how it rebooks and when it stops.",
  "pre-call-read": "A brief on each prospect before every call: where it lands, when it's written, and what feeds it.",
  "leak-map": "A weekly report, and a monthly deep-dive, on where booked calls leak out.",
};

/** What one skill's section hands the shared shell. */
interface Section {
  rows: FeedEntry[];
  /** Above the rows, e.g. Win-Back's auto-pause notice. */
  banner?: ReactNode;
  /** Why Save is off, when a required setting is missing. */
  blocker?: string;
  dirty: boolean;
  save: () => Promise<void>;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? "Couldn't load these settings.");
  return body as T;
}

async function postJson(url: string, body: unknown): Promise<void> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? "Couldn't save. Nothing else was affected.");
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ── Small editors ──────────────────────────────────────────────────────

function Done({ close, disabled }: { close: () => void; disabled?: boolean }) {
  return (
    <div className="flex justify-end pt-1">
      <button
        type="button"
        onClick={close}
        disabled={disabled}
        className="h-8 rounded-lg bg-[var(--ink)] px-3 text-[13px] font-medium text-[var(--ink-foreground)] disabled:opacity-50 cursor-pointer"
      >
        Done
      </button>
    </div>
  );
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <Labeled label={label}>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} className={`${inputCls} h-9`}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Labeled>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <Labeled label={label}>
      <input aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={`${inputCls} h-9`} />
    </Labeled>
  );
}

/** An address a client's tool is pointed at, with a copy button. */
function CopyAddress({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-start gap-2 rounded-lg bg-[var(--accent-dim)] p-2.5">
      <code className="min-w-0 flex-1 break-all text-[12px] text-[var(--text-secondary)]">{value}</code>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard
            ?.writeText(value)
            .then(() => setCopied(true))
            .catch(() => undefined);
        }}
        className="inline-flex shrink-0 items-center gap-1 text-[12px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
      >
        <Copy className="h-3 w-3" /> {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

// ── Funnel Audit (leak-map) ─────────────────────────────────────────────

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const hourLabel = (h: number) => `${String(h).padStart(2, "0")}:00`;
const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;

function validTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

type LeakMapValues = {
  weeklyScheduleDayOfWeek: number;
  weeklyScheduleHour: number;
  monthlyScheduleDayOfMonth: number;
  leakMapTimezone: string;
  auditOutputFormat: "email" | "slack" | "dashboard_only";
  leakMapReportEmail: string;
};

function useLeakMap(engagementId: string, loaded: Record<string, unknown>): Section {
  const initial = useMemo<LeakMapValues>(
    () => ({
      weeklyScheduleDayOfWeek: Number(loaded.weeklyScheduleDayOfWeek ?? 1),
      weeklyScheduleHour: Number(loaded.weeklyScheduleHour ?? 9),
      monthlyScheduleDayOfMonth: Number(loaded.monthlyScheduleDayOfMonth ?? 1),
      leakMapTimezone: String(loaded.leakMapTimezone ?? "UTC"),
      auditOutputFormat: (loaded.auditOutputFormat as LeakMapValues["auditOutputFormat"]) ?? "dashboard_only",
      leakMapReportEmail: String(loaded.leakMapReportEmail ?? ""),
    }),
    [loaded]
  );
  const [v, setV] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const set = <K extends keyof LeakMapValues>(k: K, value: LeakMapValues[K]) => setV((x) => ({ ...x, [k]: value }));
  const slackReady = Boolean(loaded.slackWebhookUrl);
  const needsEmail = v.auditOutputFormat === "email" && !v.leakMapReportEmail.trim();
  const badTz = !validTimezone(v.leakMapTimezone.trim() || "UTC");

  const rows: FeedEntry[] = [
    {
      key: "weekly",
      text: (
        <>
          A weekly report every <b>{DAYS[v.weeklyScheduleDayOfWeek] ?? "Monday"}</b> at <b>{hourLabel(v.weeklyScheduleHour)}</b>
        </>
      ),
      editor: (close) => (
        <div className="space-y-3">
          <Select label="Day" value={String(v.weeklyScheduleDayOfWeek)} options={DAYS.map((d, i) => ({ value: String(i), label: d }))} onChange={(x) => set("weeklyScheduleDayOfWeek", Number(x))} />
          <Select label="Time (also used for the monthly report)" value={String(v.weeklyScheduleHour)} options={Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: hourLabel(h) }))} onChange={(x) => set("weeklyScheduleHour", Number(x))} />
          <Done close={close} />
        </div>
      ),
    },
    {
      key: "monthly",
      text: (
        <>
          A monthly deep-dive on the <b>{ordinal(v.monthlyScheduleDayOfMonth)}</b>
        </>
      ),
      source: "Up to the 28th, so it runs every month, February included.",
      editor: (close) => (
        <div className="space-y-3">
          <Select label="Day of the month" value={String(v.monthlyScheduleDayOfMonth)} options={Array.from({ length: 28 }, (_, d) => ({ value: String(d + 1), label: ordinal(d + 1) }))} onChange={(x) => set("monthlyScheduleDayOfMonth", Number(x))} />
          <Done close={close} />
        </div>
      ),
    },
    {
      key: "timezone",
      text: (
        <>
          Times are in <b>{v.leakMapTimezone || "UTC"}</b>
        </>
      ),
      warn: badTz,
      source: badTz ? "Not a time zone we recognise. Use a name like America/New_York." : undefined,
      editor: (close) => (
        <div className="space-y-3">
          <Field label="Time zone" value={v.leakMapTimezone} onChange={(x) => set("leakMapTimezone", x)} placeholder="America/New_York" />
          <Done close={close} disabled={badTz} />
        </div>
      ),
    },
    {
      key: "delivery",
      todo: needsEmail,
      warn: v.auditOutputFormat === "slack" && !slackReady,
      text:
        v.auditOutputFormat === "email" ? (
          v.leakMapReportEmail.trim() ? (
            <>
              Reports are emailed to <b>{v.leakMapReportEmail.trim()}</b>
            </>
          ) : (
            <>Reports are set to go by email. Add the address to send them to.</>
          )
        ) : v.auditOutputFormat === "slack" ? (
          <>
            Reports are posted to <b>Slack</b>
          </>
        ) : (
          <>
            Reports stay on the <b>dashboard</b>
          </>
        ),
      source: v.auditOutputFormat === "slack" && !slackReady ? "Slack posting uses the Slack address set in Call Brief's settings, and there isn't one yet." : undefined,
      editor: (close) => (
        <div className="space-y-3">
          <ChoiceList
            options={[
              { value: "dashboard_only", label: "The dashboard only" },
              { value: "email", label: "Email" },
              { value: "slack", label: "Slack", hint: "Uses the Slack address from Call Brief's settings." },
            ]}
            value={v.auditOutputFormat}
            onPick={(x) => set("auditOutputFormat", x as LeakMapValues["auditOutputFormat"])}
          />
          {v.auditOutputFormat === "email" && <Field label="Send reports to" value={v.leakMapReportEmail} onChange={(x) => set("leakMapReportEmail", x)} placeholder="ops@client.com" />}
          <Done close={close} disabled={needsEmail} />
        </div>
      ),
    },
  ];

  return {
    rows,
    dirty: !same(v, saved),
    blocker: needsEmail ? "Add the address reports are emailed to." : badTz ? "Fix the time zone." : undefined,
    save: async () => {
      await postJson(`/api/engagements/${engagementId}/bridges/leak-map`, { ...v, leakMapTimezone: v.leakMapTimezone.trim() || "UTC", leakMapReportEmail: v.leakMapReportEmail.trim() });
      setSaved(v);
    },
  };
}

// ── Win-Back ────────────────────────────────────────────────────────────

// Where each email tool's bounce and complaint events are sent, and the
// secret each can sign them with. HubSpot is polled instead and SMTP reuses
// the reply address, so neither has one.
const DELIVERY_WEBHOOK = new Set(["klaviyo", "activecampaign", "mailchimp", "convertkit"]);
const DELIVERY_SECRET_PROVIDER: Record<string, string> = {
  klaviyo: "klaviyo_webhook_secret",
  activecampaign: "activecampaign_webhook_secret",
  mailchimp: "mailchimp_webhook_secret",
};
const EMAIL_LABELS: Record<string, string> = {
  hubspot: "HubSpot",
  klaviyo: "Klaviyo",
  activecampaign: "ActiveCampaign",
  mailchimp: "Mailchimp",
  convertkit: "Kit",
  ghl: "GoHighLevel",
  smtp: "your email server",
};

type WinBackValues = {
  rescheduleMode: "fresh_link" | "time_slots";
  recoveredFromNoShowTaggingEnabled: boolean;
  inboundReplyMode: "native" | "forwarding" | "none";
  hubspotPortalId: string;
  activecampaignWebhookSignatureHeader: string;
};

function useWinBack(engagementId: string, loaded: Record<string, unknown>): Section {
  const emailPlatform = String(loaded.emailPlatform ?? "");
  const esp = EMAIL_LABELS[emailPlatform] ?? (emailPlatform || "the email tool");
  const initial = useMemo<WinBackValues>(
    () => ({
      rescheduleMode: (loaded.rescheduleMode as WinBackValues["rescheduleMode"]) ?? "time_slots",
      recoveredFromNoShowTaggingEnabled: loaded.recoveredFromNoShowTaggingEnabled !== false,
      inboundReplyMode: (loaded.inboundReplyMode as WinBackValues["inboundReplyMode"]) ?? "none",
      hubspotPortalId: String(loaded.hubspotPortalId ?? ""),
      activecampaignWebhookSignatureHeader: String(loaded.activecampaignWebhookSignatureHeader ?? ""),
    }),
    [loaded]
  );
  const [v, setV] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const set = <K extends keyof WinBackValues>(k: K, value: WinBackValues[K]) => setV((x) => ({ ...x, [k]: value }));

  // The HubSpot portal is read from HubSpot itself (its account-info API),
  // so nobody has to copy it from HubSpot's settings.
  // Read on arrival when it's missing, so it starts as "finding".
  const lookUpOnArrival = emailPlatform === "hubspot" && !initial.hubspotPortalId;
  const [portal, setPortal] = useState<{ state: "idle" | "finding" | "found" | "failed"; error?: string }>({ state: lookUpOnArrival ? "finding" : "idle" });
  const lookUpPortal = useCallback(
    (isCancelled: () => boolean = () => false) =>
      getJson<{ portalId?: string }>(`/api/engagements/${engagementId}/bridges/win-back/hubspot-portal`)
        .then((data) => {
          if (isCancelled()) return;
          if (data.portalId) setV((x) => ({ ...x, hubspotPortalId: String(data.portalId) }));
          setPortal({ state: "found" });
        })
        .catch((e) => {
          if (!isCancelled()) setPortal({ state: "failed", error: e instanceof Error ? e.message : "HubSpot didn't say." });
        }),
    [engagementId]
  );
  const findPortal = () => {
    setPortal({ state: "finding" });
    void lookUpPortal();
  };
  useEffect(() => {
    if (!lookUpOnArrival) return;
    let cancelled = false;
    lookUpPortal(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [lookUpOnArrival, lookUpPortal]);

  // Auto-pause: sends stop when bounces or complaints cross the limit.
  const [paused, setPaused] = useState({ on: Boolean(loaded.autoPaused), at: (loaded.autoPausedAt as string | null) ?? null, reason: (loaded.autoPausedReason as string | null) ?? null });
  const [resuming, setResuming] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  async function resume() {
    setResuming(true);
    setResumeError(null);
    try {
      await postJson(`/api/engagements/${engagementId}/win-back/resume-sends`, {});
      setPaused({ on: false, at: null, reason: null });
    } catch (e) {
      setResumeError(e instanceof Error ? e.message : "Couldn't resume.");
    } finally {
      setResuming(false);
    }
  }

  const needsPortal = v.inboundReplyMode === "native" && emailPlatform === "hubspot" && !v.hubspotPortalId.trim();
  const replyCatcherUrl = String(loaded.replyCatcherUrl ?? "");
  const deliveryWebhookUrl = String(loaded.deliveryWebhookUrl ?? "");

  const rows: FeedEntry[] = [
    {
      key: "reschedule",
      text:
        v.rescheduleMode === "fresh_link" ? (
          <>
            No-shows get <b>their own one-time rebooking link</b>
          </>
        ) : (
          <>
            No-shows see <b>live open times</b> to rebook
          </>
        ),
      source: v.rescheduleMode === "fresh_link" ? "Calendly and Cal.com only; anywhere else falls back to live times." : undefined,
      editor: (close) => (
        <div className="space-y-3">
          <ChoiceList
            options={[
              { value: "time_slots", label: "Live open times", hint: "Pulled fresh each time. Works on every booking tool." },
              { value: "fresh_link", label: "A one-time rebooking link", hint: "The booking tool's own link for that booking (Calendly, Cal.com); live times elsewhere." },
            ]}
            value={v.rescheduleMode}
            onPick={(x) => set("rescheduleMode", x as WinBackValues["rescheduleMode"])}
          />
          <Done close={close} />
        </div>
      ),
    },
    {
      key: "tagging",
      text: v.recoveredFromNoShowTaggingEnabled ? (
        <>
          Anyone who rebooks is tagged <b>recovered from no-show</b> in {esp}
        </>
      ) : (
        <>Rebooked prospects aren&apos;t tagged in {esp}</>
      ),
      action: {
        label: v.recoveredFromNoShowTaggingEnabled ? "Turn off" : "Turn on",
        onClick: () => set("recoveredFromNoShowTaggingEnabled", !v.recoveredFromNoShowTaggingEnabled),
      },
    },
    {
      key: "replies",
      text:
        v.inboundReplyMode === "none" ? (
          <>
            A reply <b>doesn&apos;t stop</b> the sequence; only a rebook or the window ending does
          </>
        ) : v.inboundReplyMode === "native" ? (
          <>
            A reply in <b>HubSpot Conversations</b> stops the sequence for that prospect
          </>
        ) : (
          <>
            A <b>forwarded reply</b> stops the sequence for that prospect
          </>
        ),
      source: v.inboundReplyMode === "forwarding" ? "Point the client's inbound-parse bridge (Postmark, SendGrid) at this address:" : undefined,
      body: v.inboundReplyMode === "forwarding" && replyCatcherUrl ? <CopyAddress value={replyCatcherUrl} /> : undefined,
      editor: (close) => (
        <div className="space-y-3">
          <ChoiceList
            options={[
              { value: "none", label: "Don't watch for replies" },
              { value: "forwarding", label: "Forwarded replies", hint: "The client forwards replies through an inbound-parse bridge." },
              ...(emailPlatform === "hubspot" ? [{ value: "native" as const, label: "HubSpot Conversations" }] : []),
            ]}
            value={v.inboundReplyMode}
            onPick={(x) => set("inboundReplyMode", x as WinBackValues["inboundReplyMode"])}
          />
          <Done close={close} />
        </div>
      ),
    },
  ];

  if (emailPlatform === "hubspot" && v.inboundReplyMode === "native") {
    rows.push({
      key: "portal",
      todo: needsPortal,
      warn: portal.state === "failed" && needsPortal,
      text: v.hubspotPortalId.trim() ? (
        <>
          HubSpot account <b>{v.hubspotPortalId.trim()}</b>
        </>
      ) : portal.state === "finding" ? (
        <>Finding the HubSpot account&hellip;</>
      ) : (
        <>Add the HubSpot account (portal) ID, so replies can be matched</>
      ),
      source:
        portal.state === "found" && v.hubspotPortalId
          ? "Read from HubSpot."
          : portal.state === "failed"
            ? `HubSpot didn't say (${portal.error}). It's under Settings, Account Setup, Account Defaults in HubSpot.`
            : undefined,
      editor: (close) => (
        <div className="space-y-3">
          <Field label="HubSpot portal ID" value={v.hubspotPortalId} onChange={(x) => set("hubspotPortalId", x.trim())} placeholder="12345678" />
          <button type="button" onClick={findPortal} className="text-[12px] text-[var(--text-muted)] underline underline-offset-4 hover:text-[var(--text-primary)] cursor-pointer">
            Read it from HubSpot again
          </button>
          <Done close={close} />
        </div>
      ),
    });
  }

  if (DELIVERY_WEBHOOK.has(emailPlatform)) {
    rows.push({
      key: "deliverability",
      text: (
        <>
          <b>Bounce and complaint watch</b>: sends pause on their own if {esp} reports too many
        </>
      ),
      source: deliveryWebhookUrl ? `Optional. Add this address as a webhook in ${esp} to switch it on:` : "Optional. Save once to get this client's address.",
      body: deliveryWebhookUrl ? <CopyAddress value={deliveryWebhookUrl} /> : undefined,
      editLabel: emailPlatform === "convertkit" ? undefined : "Signing",
      editor:
        emailPlatform === "convertkit"
          ? undefined
          : (close) => (
              <div className="space-y-3">
                {emailPlatform === "activecampaign" && (
                  <Field
                    label="Signature header name (the one you marked as the signature in ActiveCampaign)"
                    value={v.activecampaignWebhookSignatureHeader}
                    onChange={(x) => set("activecampaignWebhookSignatureHeader", x)}
                    placeholder="X-My-Signature"
                  />
                )}
                {emailPlatform === "mailchimp" && (
                  <p className="text-[12px] leading-relaxed text-[var(--text-muted)]">
                    The address already carries this client&apos;s token. To add your own secret too, append <code>&amp;secret=</code> and your value to it before pasting it into Mailchimp, then save the
                    same value here.
                  </p>
                )}
                {DELIVERY_SECRET_PROVIDER[emailPlatform] && <CredentialRow engagementId={engagementId} provider={DELIVERY_SECRET_PROVIDER[emailPlatform]} label="Webhook secret" embedded />}
                <Done close={close} />
              </div>
            ),
    });
  } else if (emailPlatform === "ghl") {
    rows.push({
      key: "deliverability",
      warn: true,
      text: <>Bounce and complaint watch isn&apos;t available for GoHighLevel yet</>,
      source: "GoHighLevel only shares that data with Marketplace apps, which this connection isn't. Sends aren't paused on their own.",
    });
  }

  const banner = paused.on ? (
    <div className="space-y-2 rounded-xl border border-rose-300 bg-rose-50 p-3.5 dark:border-rose-900/50 dark:bg-rose-950/20">
      <p className="text-[14px] font-medium text-rose-900 dark:text-rose-200">
        Win-Back is paused{paused.at ? ` since ${new Date(paused.at).toLocaleString()}` : ""}
      </p>
      <p className="text-[13px] leading-relaxed text-rose-800 dark:text-rose-300">
        {paused.reason ?? "Too many bounces or complaints."} Everyone in the sequence was taken out of it in {esp}, and nobody new is added until you resume.
      </p>
      {resumeError && <p className="text-[13px] text-rose-700 dark:text-rose-400">{resumeError}</p>}
      <button
        type="button"
        onClick={resume}
        disabled={resuming}
        className="h-8 rounded-lg border border-rose-400 px-3 text-[13px] font-medium text-rose-900 hover:bg-rose-100 disabled:opacity-50 dark:border-rose-800 dark:text-rose-200 dark:hover:bg-rose-900/40 cursor-pointer"
      >
        {resuming ? "Resuming…" : "Resume sending"}
      </button>
    </div>
  ) : undefined;

  return {
    rows,
    banner,
    dirty: !same(v, saved),
    blocker: needsPortal ? "Add the HubSpot account ID, or stop watching HubSpot replies." : undefined,
    save: async () => {
      await postJson(`/api/engagements/${engagementId}/bridges/win-back`, v);
      setSaved(v);
    },
  };
}

// ── Call Brief (pre-call-read) ──────────────────────────────────────────

const VIDEO_LABELS: Record<string, string> = { none: "None", vidalytics: "Vidalytics", wistia: "Wistia", youtube_analytics: "YouTube", loom: "Loom" };

type PreCallValues = {
  briefLandingDestination: string;
  slackMode: "signin" | "webhook";
  slackChannelId: string;
  slackWebhookUrl: string;
  briefTriggerType: "nightly" | "dynamic_webhook";
  videoEngagementPlatform: string;
  heroVideoId: string;
  videoEngagementWistiaVideoId: string;
  videoEngagementYoutubeChannelId: string;
  prospectResearchSourcesUsed: string[];
};

function usePreCallRead(engagementId: string, loaded: Record<string, unknown>): Section {
  const initial = useMemo<PreCallValues>(
    () => ({
      briefLandingDestination: String(loaded.briefLandingDestination ?? ""),
      // A client already on a webhook (and not signed in) stays on it.
      slackMode: loaded.slackWebhookUrl && !loaded.slackChannelId ? "webhook" : "signin",
      slackChannelId: String(loaded.slackChannelId ?? ""),
      slackWebhookUrl: String(loaded.slackWebhookUrl ?? ""),
      briefTriggerType: (loaded.briefTriggerType as PreCallValues["briefTriggerType"]) ?? "nightly",
      videoEngagementPlatform: String(loaded.videoEngagementPlatform ?? "none"),
      heroVideoId: String(loaded.heroVideoId ?? ""),
      videoEngagementWistiaVideoId: String(loaded.videoEngagementWistiaVideoId ?? ""),
      videoEngagementYoutubeChannelId: String(loaded.videoEngagementYoutubeChannelId ?? ""),
      prospectResearchSourcesUsed: Array.isArray(loaded.prospectResearchSourcesUsed) ? (loaded.prospectResearchSourcesUsed as string[]) : [],
    }),
    [loaded]
  );
  const [v, setV] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const set = <K extends keyof PreCallValues>(k: K, value: PreCallValues[K]) => setV((x) => ({ ...x, [k]: value }));

  // Slack signed in through Composio: the channels it can post to.
  const [slack, setSlack] = useState({ connected: Boolean(loaded.slackConnected), channels: (loaded.slackChannels as { id: string; name: string }[] | undefined) ?? [] });
  const refreshSlack = useCallback(async () => {
    try {
      const data = await getJson<{ slackConnected?: boolean; slackChannels?: { id: string; name: string }[] }>(`/api/engagements/${engagementId}/bridges/pre-call-read`);
      setSlack({ connected: Boolean(data.slackConnected), channels: data.slackChannels ?? [] });
    } catch {
      // Keep what's shown.
    }
  }, [engagementId]);

  const suggested = (loaded.suggestions as Record<string, { value?: unknown }> | undefined)?.briefLandingDestination?.value;
  const channelName = slack.channels.find((c) => c.id === v.slackChannelId)?.name;
  const slackReady = v.slackMode === "webhook" ? /^https:\/\/hooks\.slack\.com\//.test(v.slackWebhookUrl.trim()) : slack.connected && Boolean(v.slackChannelId);
  const destinationMissing = !v.briefLandingDestination || (v.briefLandingDestination === "slack" && !slackReady);

  const rows: FeedEntry[] = [
    {
      key: "destination",
      todo: destinationMissing,
      text:
        v.briefLandingDestination === "crm_note" ? (
          <>
            Briefs land as a <b>note on the contact</b> in the CRM
          </>
        ) : v.briefLandingDestination === "slack" ? (
          slackReady ? (
            v.slackMode === "webhook" ? (
              <>
                Briefs are posted to <b>Slack</b> through its webhook
              </>
            ) : (
              <>
                Briefs are posted to <b>#{channelName ?? "the chosen channel"}</b> in Slack
              </>
            )
          ) : (
            <>Briefs are set to go to Slack. Finish connecting it.</>
          )
        ) : (
          <>Choose where finished briefs land</>
        ),
      action:
        !v.briefLandingDestination && (suggested === "slack" || suggested === "crm_note")
          ? { label: suggested === "crm_note" ? "Use a CRM note" : "Use Slack", onClick: () => set("briefLandingDestination", String(suggested)) }
          : undefined,
      editor: (close) => (
        <div className="space-y-3">
          <ChoiceList
            options={[
              { value: "crm_note", label: "A note on the contact in the CRM", hint: "HubSpot, Klaviyo or GoHighLevel. Nothing else to set up." },
              { value: "slack", label: "A Slack channel" },
            ]}
            value={v.briefLandingDestination}
            onPick={(x) => set("briefLandingDestination", x)}
          />
          {v.briefLandingDestination === "slack" && (
            <div className="space-y-3 border-t border-[var(--border)] pt-3">
              <ChoiceList
                options={[
                  { value: "signin", label: "Sign in with Slack and pick a channel", hint: "Posts are text only." },
                  { value: "webhook", label: "Paste an incoming-webhook address", hint: "Posts keep their Approve and Reject buttons." },
                ]}
                value={v.slackMode}
                onPick={(x) => set("slackMode", x as PreCallValues["slackMode"])}
              />
              {v.slackMode === "signin" ? (
                <>
                  <CredentialRow engagementId={engagementId} provider="slack" label="Slack" embedded onSaved={() => void refreshSlack()} />
                  {slack.connected && slack.channels.length > 0 && (
                    <Select label="Channel (invite the Slack app to it)" value={v.slackChannelId} options={[{ value: "", label: "Pick a channel" }, ...slack.channels.map((c) => ({ value: c.id, label: `#${c.name}` }))]} onChange={(x) => set("slackChannelId", x)} />
                  )}
                  {slack.connected && slack.channels.length === 0 && (
                    <p className="text-[12px] text-[var(--text-muted)]">
                      Slack is connected, but its channels haven&apos;t been read yet.{" "}
                      <button type="button" onClick={() => void refreshSlack()} className="underline underline-offset-4 hover:text-[var(--text-primary)] cursor-pointer">
                        Check again
                      </button>
                    </p>
                  )}
                </>
              ) : (
                <Field label="Slack webhook address" value={v.slackWebhookUrl} onChange={(x) => set("slackWebhookUrl", x)} placeholder="https://hooks.slack.com/services/…" />
              )}
            </div>
          )}
          <Done close={close} />
        </div>
      ),
    },
    {
      key: "schedule",
      text:
        v.briefTriggerType === "dynamic_webhook" ? (
          <>
            Each brief is written <b>as its call gets close</b>
          </>
        ) : (
          <>
            Briefs are written <b>every night</b> for the next day&apos;s calls
          </>
        ),
      editor: (close) => (
        <div className="space-y-3">
          <ChoiceList
            options={[
              { value: "nightly", label: "Every night", hint: "Tomorrow's calls, briefed together at 20:00 UTC." },
              { value: "dynamic_webhook", label: "As each call gets close", hint: "Within 15 minutes of a call entering its lead window." },
            ]}
            value={v.briefTriggerType}
            onPick={(x) => set("briefTriggerType", x as PreCallValues["briefTriggerType"])}
          />
          <Done close={close} />
        </div>
      ),
    },
    {
      key: "video",
      text:
        v.videoEngagementPlatform === "none" ? (
          <>No video watch data in the brief</>
        ) : (
          <>
            Watch data from <b>{VIDEO_LABELS[v.videoEngagementPlatform] ?? v.videoEngagementPlatform}</b> goes into the brief
          </>
        ),
      source: v.videoEngagementPlatform === "loom" ? "Loom has no analytics to read, so nothing comes through from it." : v.videoEngagementPlatform === "youtube_analytics" ? "YouTube only reports totals, not per prospect." : undefined,
      editor: (close) => (
        <div className="space-y-3">
          <ChoiceList
            options={[
              { value: "none", label: "None" },
              { value: "vidalytics", label: "Vidalytics", hint: "Per prospect, if the embed passes their email." },
              { value: "wistia", label: "Wistia", hint: "Per prospect, if the embed passes their email." },
              { value: "youtube_analytics", label: "YouTube", hint: "Totals only." },
              { value: "loom", label: "Loom", hint: "No analytics to read." },
            ]}
            value={v.videoEngagementPlatform}
            onPick={(x) => set("videoEngagementPlatform", x)}
          />
          {(v.videoEngagementPlatform === "vidalytics" || v.videoEngagementPlatform === "wistia" || v.videoEngagementPlatform === "youtube_analytics") && (
            <CredentialRow
              engagementId={engagementId}
              provider={v.videoEngagementPlatform}
              label={`${v.videoEngagementPlatform === "youtube_analytics" ? "Google" : VIDEO_LABELS[v.videoEngagementPlatform]} key`}
              embedded
            />
          )}
          {v.videoEngagementPlatform === "vidalytics" && <Field label="Confirmation-page video ID" value={v.heroVideoId} onChange={(x) => set("heroVideoId", x)} />}
          {v.videoEngagementPlatform === "wistia" && <Field label="Wistia video ID" value={v.videoEngagementWistiaVideoId} onChange={(x) => set("videoEngagementWistiaVideoId", x)} />}
          {v.videoEngagementPlatform === "youtube_analytics" && (
            <>
              <Field label="YouTube channel ID" value={v.videoEngagementYoutubeChannelId} onChange={(x) => set("videoEngagementYoutubeChannelId", x)} />
              <Field label="Confirmation-page video ID" value={v.heroVideoId} onChange={(x) => set("heroVideoId", x)} />
            </>
          )}
          <Done close={close} />
        </div>
      ),
    },
    {
      key: "research",
      text:
        v.prospectResearchSourcesUsed.length === 0 ? (
          <>Research comes from the web</>
        ) : (
          <>
            The web plus <b>{v.prospectResearchSourcesUsed.map((s) => (s === "pdl" ? "People Data Labs" : "Apollo")).join(" and ")}</b>
          </>
        ),
      source: "Only if the client already pays for one; never a required cost.",
      editor: (close) => (
        <div className="space-y-3">
          {(["apollo", "pdl"] as const).map((src) => {
            const on = v.prospectResearchSourcesUsed.includes(src);
            return (
              <div key={src} className="space-y-2">
                <label className="flex items-center gap-2 text-sm text-[var(--text-primary)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) => set("prospectResearchSourcesUsed", e.target.checked ? [...v.prospectResearchSourcesUsed, src] : v.prospectResearchSourcesUsed.filter((s) => s !== src))}
                  />
                  {src === "pdl" ? "People Data Labs" : "Apollo"}
                </label>
                {on && <CredentialRow engagementId={engagementId} provider={src} label={`${src === "pdl" ? "PDL" : "Apollo"} key`} embedded />}
              </div>
            );
          })}
          <Done close={close} />
        </div>
      ),
    },
  ];

  return {
    rows,
    dirty: !same(v, saved),
    blocker: destinationMissing ? (v.briefLandingDestination === "slack" ? "Finish connecting Slack, or pick the CRM note." : "Choose where briefs land.") : undefined,
    save: async () => {
      await postJson(`/api/engagements/${engagementId}/bridges/pre-call-read`, {
        briefTriggerType: v.briefTriggerType,
        videoEngagementPlatform: v.videoEngagementPlatform,
        heroVideoId: v.heroVideoId,
        videoEngagementWistiaVideoId: v.videoEngagementWistiaVideoId,
        videoEngagementYoutubeChannelId: v.videoEngagementYoutubeChannelId,
        prospectResearchSourcesUsed: v.prospectResearchSourcesUsed,
        briefLandingDestination: v.briefLandingDestination || undefined,
        // Only the chosen Slack setup is sent; the other is cleared so briefs
        // don't keep going somewhere the person moved away from.
        ...(v.briefLandingDestination === "slack"
          ? v.slackMode === "signin"
            ? { slackChannelId: v.slackChannelId, slackWebhookUrl: "" }
            : { slackWebhookUrl: v.slackWebhookUrl.trim(), slackChannelId: "" }
          : {}),
      });
      setSaved(v);
    },
  };
}

// ── Pile-On ─────────────────────────────────────────────────────────────

type PileOnValues = {
  smsPlatform: string;
  adDataPlatform: string;
  smsPlatformMeta: { twilio_account_sid: string; twilio_messaging_service_sid: string; twilio_from_number: string; ghl_location_id: string };
};

function usePileOn(engagementId: string, loaded: Record<string, unknown>): Section {
  const initial = useMemo<PileOnValues>(() => {
    const meta = (loaded.smsPlatformMeta as Partial<PileOnValues["smsPlatformMeta"]> | undefined) ?? {};
    return {
      // Never chosen stays unchosen, rather than looking like "none" was picked.
      smsPlatform: String(loaded.smsPlatform ?? ""),
      adDataPlatform: String(loaded.adDataPlatform ?? ""),
      smsPlatformMeta: {
        twilio_account_sid: meta.twilio_account_sid ?? "",
        twilio_messaging_service_sid: meta.twilio_messaging_service_sid ?? "",
        twilio_from_number: meta.twilio_from_number ?? "",
        ghl_location_id: meta.ghl_location_id ?? "",
      },
    };
  }, [loaded]);
  const [v, setV] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const setMeta = (k: keyof PileOnValues["smsPlatformMeta"], value: string) => setV((x) => ({ ...x, smsPlatformMeta: { ...x.smsPlatformMeta, [k]: value } }));
  const suggestions = (loaded.suggestions as Record<string, { value?: unknown }> | undefined) ?? {};
  const campaign = typeof loaded.twilioCampaignStatus === "string" ? loaded.twilioCampaignStatus : null;
  const replyUrl = typeof loaded.twilioReplyUrl === "string" ? loaded.twilioReplyUrl : null;
  const smsLabel = SMS_PLATFORM_LABELS[v.smsPlatform] ?? v.smsPlatform;
  const adLabel = AD_DATA_PLATFORM_LABELS[v.adDataPlatform] ?? v.adDataPlatform;
  const suggest = (key: "smsPlatform" | "adDataPlatform", labels: Record<string, string>) => {
    const s = suggestions[key]?.value;
    return !v[key] && typeof s === "string" ? { label: `Use ${labels[s] ?? s}`, onClick: () => setV((x) => ({ ...x, [key]: s })) } : undefined;
  };

  const rows: FeedEntry[] = [
    {
      key: "sms",
      todo: !v.smsPlatform,
      warn: v.smsPlatform === "twilio" && campaign === "FAILED",
      text: !v.smsPlatform ? (
        <>Choose whether warm-up texts go out</>
      ) : v.smsPlatform === "none" ? (
        <>
          <b>No texts</b> are sent
        </>
      ) : (
        <>
          Warm-up texts go out through <b>{smsLabel}</b>
        </>
      ),
      source:
        v.smsPlatform === "twilio" && campaign === "FAILED"
          ? "Twilio rejected this client's A2P 10DLC campaign, so texts can't send. Fix and resubmit it in Twilio, then save here to check again."
          : v.smsPlatform === "twilio" && campaign === "IN_PROGRESS"
            ? "Twilio is still reviewing this client's A2P 10DLC campaign; texts start once it's approved."
            : undefined,
      action: suggest("smsPlatform", SMS_PLATFORM_LABELS),
      editor: (close) => (
        <div className="space-y-3">
          <ChoiceList options={Object.entries(SMS_PLATFORM_LABELS).map(([value, label]) => ({ value, label: value === "none" ? "No texts" : label }))} value={v.smsPlatform} onPick={(x) => setV((y) => ({ ...y, smsPlatform: x }))} />
          {v.smsPlatform && v.smsPlatform !== "none" && <CredentialRow engagementId={engagementId} provider={v.smsPlatform} label={`${smsLabel} key`} embedded />}
          {v.smsPlatform === "twilio" && (
            <>
              <Field label="Twilio Account SID" value={v.smsPlatformMeta.twilio_account_sid} onChange={(x) => setMeta("twilio_account_sid", x)} placeholder="AC…" />
              <Field label="Messaging Service SID (checks the A2P campaign)" value={v.smsPlatformMeta.twilio_messaging_service_sid} onChange={(x) => setMeta("twilio_messaging_service_sid", x)} placeholder="MG…" />
              <Field label="From number (if no Messaging Service)" value={v.smsPlatformMeta.twilio_from_number} onChange={(x) => setMeta("twilio_from_number", x)} placeholder="+15550000000" />
            </>
          )}
          {v.smsPlatform === "ghl_sms" && <Field label="GoHighLevel location ID" value={v.smsPlatformMeta.ghl_location_id} onChange={(x) => setMeta("ghl_location_id", x)} />}
          <Done close={close} />
        </div>
      ),
    },
    ...(v.smsPlatform === "twilio" && replyUrl
      ? [
          {
            key: "sms-replies",
            text: <>Replies to these texts come back to the Queue</>,
            source:
              "In Twilio, open the Messaging Service (or the number) and set \"A message comes in\" to this address. STOP stops every text to that person; reschedule requests and questions land in the Queue.",
            body: <CopyAddress value={replyUrl} />,
          } satisfies FeedEntry,
        ]
      : []),
    {
      key: "ad-data",
      todo: !v.adDataPlatform,
      text: !v.adDataPlatform ? (
        <>Choose whether booked leads feed an ad audience</>
      ) : v.adDataPlatform === "none" ? (
        <>
          Leads <b>aren&apos;t sent</b> to an ad audience
        </>
      ) : (
        <>
          Booked leads are synced to <b>{adLabel}</b> for ad audiences
        </>
      ),
      action: suggest("adDataPlatform", AD_DATA_PLATFORM_LABELS),
      editor: (close) => (
        <div className="space-y-3">
          <ChoiceList options={Object.entries(AD_DATA_PLATFORM_LABELS).map(([value, label]) => ({ value, label: value === "none" ? "Don't sync" : label }))} value={v.adDataPlatform} onPick={(x) => setV((y) => ({ ...y, adDataPlatform: x }))} />
          {v.adDataPlatform && v.adDataPlatform !== "none" && v.adDataPlatform !== "native_crm" && <CredentialRow engagementId={engagementId} provider={v.adDataPlatform} label={`${adLabel} key`} embedded />}
          <Done close={close} />
        </div>
      ),
    },
  ];

  const missing = [!v.smsPlatform && "texts", !v.adDataPlatform && "ad audiences"].filter(Boolean);
  return {
    rows,
    dirty: !same(v, saved),
    blocker: missing.length ? `Choose ${missing.join(" and ")} (either can be off).` : undefined,
    save: async () => {
      await postJson(`/api/engagements/${engagementId}/workers/pile-on/enable-with-config`, v);
      setSaved(v);
    },
  };
}

// ── The shell ───────────────────────────────────────────────────────────

const LOAD_URL: Record<ShowtimeSettingsSkill, (id: string) => string> = {
  "pile-on": (id) => `/api/engagements/${id}/workers/pile-on/enable-with-config`,
  "win-back": (id) => `/api/engagements/${id}/bridges/win-back`,
  "pre-call-read": (id) => `/api/engagements/${id}/bridges/pre-call-read`,
  "leak-map": (id) => `/api/engagements/${id}/bridges/leak-map`,
};

export function ShowtimeSkillSettings({
  engagementId,
  skill,
  onCancel,
  onSaved,
  cancelLabel = "Close",
  backHref,
}: {
  engagementId: string;
  skill: ShowtimeSettingsSkill;
  onCancel: () => void;
  onSaved?: (result: { runId?: string }) => void;
  cancelLabel?: string;
  backHref?: string;
}) {
  // What was loaded, and for which skill and client: a result for another
  // one (the props changed mid-load) reads as still loading.
  const key = `${engagementId}:${skill}`;
  const [result, setResult] = useState<{ key: string; data?: Record<string, unknown>; error?: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const k = `${engagementId}:${skill}`;
    getJson<Record<string, unknown>>(LOAD_URL[skill](engagementId))
      .then((data) => !cancelled && setResult({ key: k, data }))
      .catch((e) => !cancelled && setResult({ key: k, error: e instanceof Error ? e.message : "Couldn't load these settings." }));
    return () => {
      cancelled = true;
    };
  }, [engagementId, skill]);

  const current = result?.key === key ? result : null;
  const loaded = current?.data ?? null;
  const loadError = current?.error ?? null;

  if (loadError) return <p className="px-1 py-6 text-sm text-[var(--error)]">{loadError}</p>;
  if (!loaded) {
    return (
      <div className="space-y-3 px-1 py-2" aria-busy="true">
        <div className="h-9 w-1/2 animate-pulse rounded-lg bg-[var(--accent-dim)]" />
        <div className="h-5 w-full animate-pulse rounded bg-[var(--accent-dim)]" />
        <div className="h-5 w-4/5 animate-pulse rounded bg-[var(--accent-dim)]" />
      </div>
    );
  }
  const props: ShellProps = { engagementId, skill, loaded, onCancel, onSaved, cancelLabel, backHref };
  if (skill === "pile-on") return <PileOnSettings {...props} />;
  if (skill === "win-back") return <WinBackSettings {...props} />;
  if (skill === "pre-call-read") return <PreCallReadSettings {...props} />;
  return <LeakMapSettings {...props} />;
}

interface ShellProps {
  engagementId: string;
  skill: ShowtimeSettingsSkill;
  loaded: Record<string, unknown>;
  onCancel: () => void;
  onSaved?: (result: { runId?: string }) => void;
  cancelLabel: string;
  backHref?: string;
}

function PileOnSettings(p: ShellProps) {
  return <Shell {...p} section={usePileOn(p.engagementId, p.loaded)} />;
}
function WinBackSettings(p: ShellProps) {
  return <Shell {...p} section={useWinBack(p.engagementId, p.loaded)} />;
}
function PreCallReadSettings(p: ShellProps) {
  return <Shell {...p} section={usePreCallRead(p.engagementId, p.loaded)} />;
}
function LeakMapSettings(p: ShellProps) {
  return <Shell {...p} section={useLeakMap(p.engagementId, p.loaded)} />;
}

function Shell({ engagementId, skill, loaded, onCancel, onSaved, cancelLabel, backHref, section }: ShellProps & { section: Section }) {
  const pathname = usePathname();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const buyer = typeof loaded.buyer === "string" && loaded.buyer ? loaded.buyer : "this client";

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await section.save();
      setJustSaved(true);
      onSaved?.({});
    } catch (e) {
      const message = e instanceof Error ? e.message : "Couldn't save.";
      setError(message === "Failed to fetch" ? "Couldn't reach the server. Check the connection and try again." : message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <SettingsHeader
        mark={<AnySkillBadge skill={skill} size={36} />}
        name={anySkillDisplayName(skill)}
        buyer={buyer}
        fullSetupHref={`/dashboard/engagements/${engagementId}/bridges/pin-down?from=${encodeURIComponent(pathname ?? "")}`}
        leading={backHref ? <BackButton href={backHref} /> : undefined}
      />
      <p className="px-1 text-[14px] leading-relaxed text-[var(--text-secondary)]">{ABOUT[skill]}</p>
      {section.banner}
      <ol className="space-y-1">
        {section.rows.map((e) => (
          <FeedRow key={e.key} entry={e} />
        ))}
      </ol>
      <ApproveBar
        label="Save"
        note={section.blocker ?? (section.dirty ? "Unsaved changes." : justSaved ? "Saved." : undefined)}
        error={error}
        saving={saving}
        disabled={!section.dirty || Boolean(section.blocker)}
        onApprove={save}
        onCancel={onCancel}
        cancelLabel={cancelLabel}
      />
    </div>
  );
}
