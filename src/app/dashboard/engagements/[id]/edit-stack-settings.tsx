"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Settings2, Save } from "lucide-react";
import {
  BOOKING_PLATFORM_LABELS,
  EMAIL_PLATFORM_LABELS,
  HOSTING_PLATFORM_LABELS,
  SMS_PLATFORM_LABELS,
  AD_DATA_PLATFORM_LABELS,
  CONVERSATION_INTELLIGENCE_PROVIDER_LABELS,
} from "@/lib/copy";
import type { EngagementStack } from "@/models/schema";
import { BookingSyncStatusCard } from "@/components/booking-sync-status-card";
import { computeBookingSyncStatus, platformSupportsAutoWebhook } from "@/lib/booking-sync-status";

const BOOKING_PLATFORM_OPTIONS = Object.keys(BOOKING_PLATFORM_LABELS) as Array<keyof typeof BOOKING_PLATFORM_LABELS>;
const EMAIL_PLATFORM_OPTIONS = Object.keys(EMAIL_PLATFORM_LABELS) as Array<keyof typeof EMAIL_PLATFORM_LABELS>;
const HOSTING_PLATFORM_OPTIONS = Object.keys(HOSTING_PLATFORM_LABELS) as Array<keyof typeof HOSTING_PLATFORM_LABELS>;
const SMS_PLATFORM_OPTIONS = Object.keys(SMS_PLATFORM_LABELS) as Array<keyof typeof SMS_PLATFORM_LABELS>;
const AD_DATA_PLATFORM_OPTIONS = Object.keys(AD_DATA_PLATFORM_LABELS) as Array<keyof typeof AD_DATA_PLATFORM_LABELS>;
const CONVERSATION_INTELLIGENCE_PROVIDER_OPTIONS = Object.keys(
  CONVERSATION_INTELLIGENCE_PROVIDER_LABELS
) as Array<keyof typeof CONVERSATION_INTELLIGENCE_PROVIDER_LABELS>;

const RECALL_REGION_LABELS: Record<string, string> = {
  "us-east-1": "US East",
  "us-west-2": "US West",
  "eu-central-1": "EU Central",
  "ap-northeast-1": "Asia Pacific (Northeast)",
};
const RECALL_REGION_OPTIONS = Object.keys(RECALL_REGION_LABELS);

type MetaField = { key: string; label: string; placeholder?: string };

function bookingMetaFieldsFor(platform: string | undefined): MetaField[] {
  switch (platform) {
    case "ghl_calendar":
      return [
        { key: "location_id", label: "Location ID" },
        { key: "calendar_id", label: "Calendar ID (optional)" },
      ];
    case "calendly":
      return [
        { key: "organization_uri", label: "Organization URI" },
        { key: "event_type_uuid", label: "Event type UUID (optional)" },
      ];
    case "cal_com":
      return [
        { key: "username", label: "Cal.com username" },
        { key: "cal_event_type_id", label: "Event type ID (optional)" },
      ];
    case "oncehub":
      return [{ key: "account_id", label: "Account ID" }];
    default:
      return [];
  }
}

function hostingMetaFieldsFor(platform: string | undefined): MetaField[] {
  switch (platform) {
    case "webflow":
      return [
        { key: "webflow_site_id", label: "Webflow site ID" },
        { key: "webflow_collection_id", label: "Collection ID (optional)" },
        { key: "webflow_page_id", label: "Page ID (optional)" },
      ];
    case "wordpress":
      return [
        { key: "wordpress_site_url", label: "WordPress site URL" },
        { key: "wordpress_page_id", label: "Page ID (optional)" },
      ];
    case "nextjs_vercel":
      return [
        { key: "vercel_project_name", label: "Vercel project name" },
        { key: "vercel_team_id", label: "Vercel team ID (optional)" },
      ];
    default:
      return [];
  }
}

function smsMetaFieldsFor(platform: string | undefined): MetaField[] {
  switch (platform) {
    case "twilio":
      return [
        { key: "twilio_account_sid", label: "Twilio Account SID" },
        { key: "twilio_messaging_service_sid", label: "Messaging Service SID (optional)" },
        { key: "twilio_from_number", label: "From number" },
      ];
    case "ghl_sms":
      return [{ key: "ghl_location_id", label: "GHL Location ID" }];
    case "hubspot_sms":
      return [{ key: "hubspot_sms_status_property", label: "Status property name" }];
    default:
      return [];
  }
}

function adDataMetaFieldsFor(platform: string | undefined): MetaField[] {
  switch (platform) {
    case "hyros":
      return [{ key: "hyros_account_id", label: "Hyros account ID" }];
    case "google_sheets":
      return [
        { key: "google_sheets_spreadsheet_id", label: "Spreadsheet ID" },
        { key: "google_sheets_cohort_sheet_name", label: "Cohort sheet name" },
      ];
    default:
      return [];
  }
}

function emailStructureFieldsFor(platform: string | undefined): MetaField[] {
  switch (platform) {
    case "klaviyo":
    case "mailchimp":
      return [
        { key: "target_list_id", label: "Target list ID (Pile-On)" },
        { key: "recovery_list_id", label: "Recovery list ID (Win-Back)" },
      ];
    case "convertkit":
      return [
        { key: "target_list_id", label: "Target form ID (Pile-On)" },
        { key: "recovery_list_id", label: "Recovery tag ID (Win-Back)" },
      ];
    case "activecampaign":
      return [
        { key: "activecampaign_base_url", label: "Account base URL" },
        { key: "target_list_id", label: "Target list ID (Pile-On)" },
        { key: "recovery_list_id", label: "Recovery list ID (Win-Back)" },
        { key: "recovery_automation_id", label: "Recovery automation ID (optional)" },
      ];
    case "hubspot":
      return [
        { key: "recovery_workflow_id", label: "Recovery workflow ID (Win-Back)" },
        { key: "hubspot_portal_id", label: "Portal ID (inbound-reply routing, optional)" },
      ];
    case "ghl":
      return [
        { key: "target_workflow_id", label: "Pile-On workflow ID" },
        { key: "recovery_workflow_id", label: "Win-Back workflow ID" },
      ];
    default:
      return [];
  }
}

function allMetaKeys(): string[] {
  const platforms = {
    booking: ["ghl_calendar", "calendly", "cal_com", "oncehub"],
    hosting: ["webflow", "wordpress", "nextjs_vercel"],
    sms: ["twilio", "ghl_sms", "hubspot_sms"],
    adData: ["hyros", "google_sheets"],
    email: ["klaviyo", "mailchimp", "convertkit", "activecampaign", "hubspot", "ghl"],
  };
  const keys = new Set<string>();
  platforms.booking.forEach((p) => bookingMetaFieldsFor(p).forEach((f) => keys.add(f.key)));
  platforms.hosting.forEach((p) => hostingMetaFieldsFor(p).forEach((f) => keys.add(f.key)));
  platforms.sms.forEach((p) => smsMetaFieldsFor(p).forEach((f) => keys.add(f.key)));
  platforms.adData.forEach((p) => adDataMetaFieldsFor(p).forEach((f) => keys.add(f.key)));
  platforms.email.forEach((p) => emailStructureFieldsFor(p).forEach((f) => keys.add(f.key)));
  return Array.from(keys);
}

function MetaFieldInputs({
  fields,
  values,
  onChange,
}: {
  fields: MetaField[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  if (fields.length === 0) return null;
  return (
    <>
      {fields.map((f) => (
        <label key={f.key} className="space-y-1 block">
          <span className="text-[11px] font-mono text-zinc-400 dark:text-zinc-600 uppercase tracking-wider">{f.label}</span>
          <input
            value={values[f.key] ?? ""}
            onChange={(e) => onChange(f.key, e.target.value)}
            placeholder={f.placeholder}
            className="w-full text-xs font-mono px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300"
          />
        </label>
      ))}
    </>
  );
}

function GhlCalendarPicker({
  engagementId,
  locationId,
  value,
  onChange,
}: {
  engagementId: string;
  locationId: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [options, setOptions] = useState<{ id: string; name: string; link: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = locationId?.trim();
    if (!trimmed) {
      setOptions([]);
      setError(null);
      return;
    }
    const timer = setTimeout(() => {
      setLoading(true);
      setError(null);
      fetch(`/api/engagements/${engagementId}/booking-calendars?locationId=${encodeURIComponent(trimmed)}`)
        .then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data?.error || `Request failed [${res.status}]`);
          return data;
        })
        .then((data) => {
          if (data.success) setOptions(data.options ?? []);
          else throw new Error(data.error ?? "Failed to load calendars.");
        })
        .catch((e: unknown) => {
          setError(e instanceof Error ? e.message : "Could not load calendars from GoHighLevel.");
          setOptions([]);
        })
        .finally(() => setLoading(false));
    }, 400);
    return () => clearTimeout(timer);
  }, [engagementId, locationId]);

  return (
    <label className="space-y-1 block">
      <span className="text-[11px] font-mono text-zinc-400 dark:text-zinc-600 uppercase tracking-wider">Calendar</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={loading || options.length === 0}
        className="w-full text-xs font-mono px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 disabled:opacity-50"
      >
        <option value="">
          {loading
            ? "Loading calendars…"
            : !locationId?.trim()
            ? "-- Enter a Location ID above first --"
            : options.length === 0
            ? "-- No calendars found --"
            : "-- Choose a calendar --"}
        </option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.name}</option>
        ))}
      </select>
      {error && <p className="text-[10px] font-mono text-rose-600 dark:text-rose-400 leading-relaxed">⚠ {error}</p>}
      {!error && !loading && options.length > 0 && (
        <p className="text-[10px] font-mono text-zinc-400 dark:text-zinc-600 leading-relaxed">
          Picking the wrong calendar here is exactly what causes GHL 422 errors — select the one bookings actually land in.
        </p>
      )}
    </label>
  );
}

function GroupHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-mono font-bold text-zinc-400 dark:text-zinc-600 uppercase tracking-wider pt-2 first:pt-0">
      {children}
    </p>
  );
}

export function EditStackSettings({
  engagementId,
  initialStack,
  embedded = false,
  onRequestClose,
  initialHighlightSection,
}: {
  engagementId: string;
  initialStack: EngagementStack | null;
  embedded?: boolean;
  onRequestClose?: () => void;
  /**
   * Same purpose as the ?fixSection= URL param below, for callers already
   * mounted on this page (e.g. the action menu's Call Intelligence "Manage"
   * button) — the URL param only takes effect on a fresh page load, since
   * `open`/`highlightSection` are lazy useState initializers that don't
   * re-run on a same-page searchParams change. This component only ever
   * mounts fresh when its parent Modal opens, so a prop set right before
   * that works where the URL param wouldn't.
   */
  initialHighlightSection?: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fixSection = searchParams.get("fixSection") || initialHighlightSection || null;
  const [open, setOpen] = useState(() => Boolean(fixSection) || embedded);
  const [highlightSection, setHighlightSection] = useState<string | null>(fixSection);

  const bookingSectionRef = useRef<HTMLDivElement>(null);
  const hostingSectionRef = useRef<HTMLDivElement>(null);
  const emailSectionRef = useRef<HTMLDivElement>(null);
  const smsSectionRef = useRef<HTMLDivElement>(null);
  const adDataSectionRef = useRef<HTMLDivElement>(null);
  const conversationIntelligenceSectionRef = useRef<HTMLDivElement>(null);
  const sectionRefs: Record<string, React.RefObject<HTMLDivElement | null>> = {
    booking: bookingSectionRef,
    hosting: hostingSectionRef,
    email: emailSectionRef,
    sms: smsSectionRef,
    ad_data: adDataSectionRef,
    conversation_intelligence: conversationIntelligenceSectionRef,
  };

  useEffect(() => {
    if (!fixSection) return;
    const t = setTimeout(() => {
      sectionRefs[fixSection]?.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
    const clearHighlight = setTimeout(() => setHighlightSection(null), 3000);
    return () => {
      clearTimeout(t);
      clearTimeout(clearHighlight);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [bookingPlatform, setBookingPlatform] = useState(initialStack?.booking_platform ?? "");
  const [emailPlatform, setEmailPlatform] = useState(initialStack?.email_platform ?? "");
  const [hostingPlatform, setHostingPlatform] = useState(initialStack?.hosting_platform ?? "");
  const [smsPlatform, setSmsPlatform] = useState(initialStack?.sms_platform ?? "");
  const [adDataPlatform, setAdDataPlatform] = useState(initialStack?.ad_data_platform ?? "");
  const [conversationIntelligenceProvider, setConversationIntelligenceProvider] = useState(
    initialStack?.conversation_intelligence_provider ?? ""
  );

  const [webhookMode, setWebhookMode] = useState(initialStack?.webhook_receiver_mode ?? "");

  const [recallRegion, setRecallRegion] = useState(initialStack?.conversation_intelligence_meta?.recall_region ?? "");
  const [recallBotName, setRecallBotName] = useState(initialStack?.conversation_intelligence_meta?.recall_bot_name ?? "");
  const [recallSigningSecret, setRecallSigningSecret] = useState(
    initialStack?.conversation_intelligence_meta?.recall_webhook_signing_secret ?? ""
  );

  const [meta, setMeta] = useState<Record<string, string>>(() => {
    const seeded: Record<string, string> = {};
    for (const key of allMetaKeys()) seeded[key] = "";
    const sources = [
      initialStack?.booking_platform_meta,
      initialStack?.hosting_platform_meta,
      initialStack?.sms_platform_meta,
      initialStack?.ad_data_platform_meta,
    ];
    for (const src of sources) {
      if (!src) continue;
      for (const [k, v] of Object.entries(src)) {
        if (typeof v === "string") seeded[k] = v;
      }
    }
    const flatFields = ["target_list_id", "recovery_list_id", "recovery_workflow_id", "recovery_automation_id", "target_workflow_id", "activecampaign_base_url", "hubspot_portal_id"];
    for (const key of flatFields) {
      const v = (initialStack as unknown as Record<string, unknown> | null)?.[key];
      if (typeof v === "string") seeded[key] = v;
    }
    return seeded;
  });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function setMetaField(key: string, value: string) {
    setMeta((m) => ({ ...m, [key]: value }));
    setSaved(false);
  }

  const bookingMetaFields = bookingMetaFieldsFor(bookingPlatform);
  const hostingMetaFields = hostingMetaFieldsFor(hostingPlatform);
  const smsMetaFields = smsMetaFieldsFor(smsPlatform);
  const adDataMetaFields = adDataMetaFieldsFor(adDataPlatform);
  const emailStructureFields = emailStructureFieldsFor(emailPlatform);

  const sectionHighlightClass = (key: string) =>
    highlightSection === key ? " ring-2 ring-ink rounded-lg -mx-2 px-2 py-2 transition-shadow duration-500" : "";

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      function pickMeta(fields: MetaField[]) {
        return Object.fromEntries(
          fields.map((f) => [f.key, meta[f.key]?.trim() ?? ""]).filter(([, v]) => v !== "")
        );
      }
      const bookingMetaPayload = pickMeta(bookingMetaFields);
      const hostingMetaPayload = pickMeta(hostingMetaFields);
      const smsMetaPayload = pickMeta(smsMetaFields);
      const adDataMetaPayload = pickMeta(adDataMetaFields);
      const flatPayload = pickMeta(emailStructureFields);

      const effectiveWebhookMode =
        webhookMode || (!platformSupportsAutoWebhook(bookingPlatform) ? "polling" : "");

      const conversationIntelligenceMetaPayload = Object.fromEntries(
        [
          ["recall_region", recallRegion],
          ["recall_bot_name", recallBotName.trim()],
          ["recall_webhook_signing_secret", recallSigningSecret.trim()],
        ].filter(([, v]) => v !== "")
      );

      const res = await fetch(`/api/engagements/${engagementId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stack: {
            ...(bookingPlatform ? { booking_platform: bookingPlatform } : {}),
            ...(emailPlatform ? { email_platform: emailPlatform } : {}),
            ...(hostingPlatform ? { hosting_platform: hostingPlatform } : {}),
            ...(smsPlatform ? { sms_platform: smsPlatform } : {}),
            ...(adDataPlatform ? { ad_data_platform: adDataPlatform } : {}),
            ...(conversationIntelligenceProvider ? { conversation_intelligence_provider: conversationIntelligenceProvider } : {}),
            ...(effectiveWebhookMode ? { webhook_receiver_mode: effectiveWebhookMode } : {}),
            ...(Object.keys(conversationIntelligenceMetaPayload).length > 0
              ? { conversation_intelligence_meta: conversationIntelligenceMetaPayload }
              : {}),
            ...(Object.keys(bookingMetaPayload).length > 0 ? { booking_platform_meta: bookingMetaPayload } : {}),
            ...(Object.keys(hostingMetaPayload).length > 0 ? { hosting_platform_meta: hostingMetaPayload } : {}),
            ...(Object.keys(smsMetaPayload).length > 0 ? { sms_platform_meta: smsMetaPayload } : {}),
            ...(Object.keys(adDataMetaPayload).length > 0 ? { ad_data_platform_meta: adDataMetaPayload } : {}),
            ...flatPayload,
          },
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSaved(true);
        router.refresh();
      } else {
        setError(data.error ?? "Failed to save.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    if (embedded) return null;
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-[11px] font-mono font-bold px-2 py-1 rounded border border-zinc-300 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-600 hover:text-zinc-900 dark:hover:text-zinc-200 transition-all cursor-pointer"
      >
        <Settings2 className="w-3 h-3" /> Edit stack settings
      </button>
    );
  }

  return (
    <div className={embedded ? "space-y-4" : "rounded-lg border border-zinc-200 dark:border-zinc-900 bg-white/40 dark:bg-black p-4 space-y-4 shadow-sm"}>
      {!embedded && (
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
            <Settings2 className="w-3.5 h-3.5" /> Edit stack settings
          </p>
          <button
            onClick={() => { setOpen(false); onRequestClose?.(); }}
            className="text-[11px] font-mono text-zinc-400 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-400 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      )}
      <p className="text-[11px] text-zinc-400 dark:text-zinc-600 font-mono leading-relaxed">
        Fixes a mistake made during onboarding, or an account ID that changed on the buyer&apos;s end —
        every platform this engagement can be connected to is editable here, not just booking.
        This does not touch stored credential secrets; use &quot;Update credentials&quot; below for that.
      </p>

      <div className="space-y-4">
        {/* Booking */}
        <div
          ref={bookingSectionRef}
          id="stack-section-booking"
          className={`grid grid-cols-1 sm:grid-cols-2 gap-3${sectionHighlightClass("booking")}`}
        >
          <GroupHeading>Booking</GroupHeading>
          <div />
          <label className="space-y-1 block">
            <span className="text-[11px] font-mono text-zinc-400 dark:text-zinc-600 uppercase tracking-wider">Booking platform</span>
            <select
              value={bookingPlatform}
              onChange={(e) => setBookingPlatform(e.target.value)}
              className="w-full text-xs font-mono px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300"
            >
              <option value="">— not set —</option>
              {BOOKING_PLATFORM_OPTIONS.map((p) => (
                <option key={p} value={p}>{BOOKING_PLATFORM_LABELS[p]}</option>
              ))}
            </select>
          </label>

          <label className="space-y-1 block">
            <span className="text-[11px] font-mono text-zinc-400 dark:text-zinc-600 uppercase tracking-wider">Booking events received via</span>
            <select
              value={webhookMode}
              onChange={(e) => setWebhookMode(e.target.value as typeof webhookMode)}
              className="w-full text-xs font-mono px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300"
            >
              <option value="">— not set —</option>
              <option value="webhook">
                {platformSupportsAutoWebhook(bookingPlatform)
                  ? "Webhook (registered automatically)"
                  : "Webhook (you paste this into the platform manually)"}
              </option>
              <option value="polling">
                Polling{platformSupportsAutoWebhook(bookingPlatform) ? "" : " (automatic fallback)"}
              </option>
              <option value="none">Not tracked</option>
            </select>
            {!platformSupportsAutoWebhook(bookingPlatform) && bookingPlatform && (
              <p className="text-[10px] font-mono text-zinc-400 dark:text-zinc-600 leading-relaxed">
                {BOOKING_PLATFORM_LABELS[bookingPlatform as keyof typeof BOOKING_PLATFORM_LABELS] ?? "This platform"} can&apos;t register a webhook by itself — polling covers you every 5 min until you paste one in (see the sync status card below).
              </p>
            )}
          </label>

          <MetaFieldInputs
            fields={bookingPlatform === "ghl_calendar" ? bookingMetaFields.filter((f) => f.key !== "calendar_id") : bookingMetaFields}
            values={meta}
            onChange={setMetaField}
          />
          {bookingPlatform === "ghl_calendar" && (
            <GhlCalendarPicker
              engagementId={engagementId}
              locationId={meta.location_id ?? ""}
              value={meta.calendar_id ?? ""}
              onChange={(v) => setMetaField("calendar_id", v)}
            />
          )}

          {/* Interactive Booking Sync Card placed inside Modify settings */}
          {bookingPlatform && (
            <div className="sm:col-span-2 pt-2">
              <BookingSyncStatusCard
                engagementId={engagementId}
                status={computeBookingSyncStatus(
                  engagementId,
                  {
                    ...(initialStack ?? {}),
                    booking_platform: bookingPlatform as any,
                    webhook_receiver_mode:
                      webhookMode ||
                      (!platformSupportsAutoWebhook(bookingPlatform) ? "polling" : undefined),
                  } as unknown as EngagementStack
                )}
              />
            </div>
          )}
        </div>

        {/* Confirmation page hosting */}
        <div
          ref={hostingSectionRef}
          id="stack-section-hosting"
          className={`grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-zinc-100 dark:border-zinc-900/50 pt-3${sectionHighlightClass("hosting")}`}
        >
          <GroupHeading>Confirmation page hosting</GroupHeading>
          <div />
          <label className="space-y-1 block">
            <span className="text-[11px] font-mono text-zinc-400 dark:text-zinc-600 uppercase tracking-wider">Hosting platform</span>
            <select
              value={hostingPlatform}
              onChange={(e) => setHostingPlatform(e.target.value)}
              className="w-full text-xs font-mono px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300"
            >
              <option value="">— not set —</option>
              {HOSTING_PLATFORM_OPTIONS.map((p) => (
                <option key={p} value={p}>{HOSTING_PLATFORM_LABELS[p]}</option>
              ))}
            </select>
          </label>
          <MetaFieldInputs fields={hostingMetaFields} values={meta} onChange={setMetaField} />
        </div>

        {/* Email / CRM automation */}
        <div
          ref={emailSectionRef}
          id="stack-section-email"
          className={`grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-zinc-100 dark:border-zinc-900/50 pt-3${sectionHighlightClass("email")}`}
        >
          <GroupHeading>Email / CRM automation</GroupHeading>
          <div />
          <label className="space-y-1 block">
            <span className="text-[11px] font-mono text-zinc-400 dark:text-zinc-600 uppercase tracking-wider">Email platform</span>
            <select
              value={emailPlatform}
              onChange={(e) => setEmailPlatform(e.target.value as typeof emailPlatform)}
              className="w-full text-xs font-mono px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300"
            >
              <option value="">— not set —</option>
              {EMAIL_PLATFORM_OPTIONS.map((p) => (
                <option key={p} value={p}>{EMAIL_PLATFORM_LABELS[p]}</option>
              ))}
            </select>
          </label>
          <MetaFieldInputs fields={emailStructureFields} values={meta} onChange={setMetaField} />
          {emailPlatform === "ghl" && (
            bookingPlatform === "ghl_calendar" ? (
              <p className="text-[10px] font-mono text-zinc-400 dark:text-zinc-600 leading-relaxed sm:col-span-2">
                GoHighLevel CRM actions reuse the Location ID set under Booking above — no separate one needed here.
              </p>
            ) : (
              <p className="text-[10px] font-mono text-amber-600 dark:text-amber-400 leading-relaxed sm:col-span-2">
                GoHighLevel CRM actions need a Location ID, and this form only has a field for one when Booking
                platform above is also GoHighLevel Calendar. With a different booking platform selected, Pile-On
                and Win-Back enrollment for this GHL email connection will fail until Booking platform is set to
                GoHighLevel Calendar too (see src/features/pile-on/server/enrollment-service.ts — it reads
                location_id off booking_platform_meta, not a GHL-email-specific field).
              </p>
            )
          )}
        </div>

        {/* SMS */}
        <div
          ref={smsSectionRef}
          id="stack-section-sms"
          className={`grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-zinc-100 dark:border-zinc-900/50 pt-3${sectionHighlightClass("sms")}`}
        >
          <GroupHeading>SMS</GroupHeading>
          <div />
          <label className="space-y-1 block">
            <span className="text-[11px] font-mono text-zinc-400 dark:text-zinc-600 uppercase tracking-wider">SMS platform</span>
            <select
              value={smsPlatform}
              onChange={(e) => setSmsPlatform(e.target.value as typeof smsPlatform)}
              className="w-full text-xs font-mono px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300"
            >
              <option value="">— not set —</option>
              {SMS_PLATFORM_OPTIONS.map((p) => (
                <option key={p} value={p}>{SMS_PLATFORM_LABELS[p]}</option>
              ))}
            </select>
          </label>
          <MetaFieldInputs fields={smsMetaFields} values={meta} onChange={setMetaField} />
        </div>

        {/* Ad-data cohort sync */}
        <div
          ref={adDataSectionRef}
          id="stack-section-ad_data"
          className={`grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-zinc-100 dark:border-zinc-900/50 pt-3${sectionHighlightClass("ad_data")}`}
        >
          <GroupHeading>Ad-data cohort sync</GroupHeading>
          <div />
          <label className="space-y-1 block">
            <span className="text-[11px] font-mono text-zinc-400 dark:text-zinc-600 uppercase tracking-wider">Ad-data platform</span>
            <select
              value={adDataPlatform}
              onChange={(e) => setAdDataPlatform(e.target.value as typeof adDataPlatform)}
              className="w-full text-xs font-mono px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300"
            >
              <option value="">— not set —</option>
              {AD_DATA_PLATFORM_OPTIONS.map((p) => (
                <option key={p} value={p}>{AD_DATA_PLATFORM_LABELS[p]}</option>
              ))}
            </select>
          </label>
          <MetaFieldInputs fields={adDataMetaFields} values={meta} onChange={setMetaField} />
        </div>

        {/* Call Intelligence (Recall.ai) */}
        <div
          ref={conversationIntelligenceSectionRef}
          id="stack-section-conversation_intelligence"
          className={`grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-zinc-100 dark:border-zinc-900/50 pt-3${sectionHighlightClass("conversation_intelligence")}`}
        >
          <GroupHeading>Call intelligence</GroupHeading>
          <div />
          <label className="space-y-1 block">
            <span className="text-[11px] font-mono text-zinc-400 dark:text-zinc-600 uppercase tracking-wider">Call intelligence provider</span>
            <select
              value={conversationIntelligenceProvider}
              onChange={(e) => setConversationIntelligenceProvider(e.target.value as typeof conversationIntelligenceProvider)}
              className="w-full text-xs font-mono px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300"
            >
              <option value="">— not set —</option>
              {CONVERSATION_INTELLIGENCE_PROVIDER_OPTIONS.map((p) => (
                <option key={p} value={p}>{CONVERSATION_INTELLIGENCE_PROVIDER_LABELS[p]}</option>
              ))}
            </select>
          </label>
          <div />

          {conversationIntelligenceProvider === "recall_ai" && (
            <>
              <label className="space-y-1 block">
                <span className="text-[11px] font-mono text-zinc-400 dark:text-zinc-600 uppercase tracking-wider">Recall workspace region</span>
                <select
                  value={recallRegion}
                  onChange={(e) => setRecallRegion(e.target.value)}
                  className="w-full text-xs font-mono px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300"
                >
                  <option value="">— defaults to US East —</option>
                  {RECALL_REGION_OPTIONS.map((r) => (
                    <option key={r} value={r}>{RECALL_REGION_LABELS[r]}</option>
                  ))}
                </select>
                <p className="text-[10px] font-mono text-zinc-400 dark:text-zinc-600 leading-relaxed">
                  Must match the region shown in this client&apos;s own Recall.ai dashboard — a mismatch 404s every call.
                </p>
              </label>

              <label className="space-y-1 block">
                <span className="text-[11px] font-mono text-zinc-400 dark:text-zinc-600 uppercase tracking-wider">Bot display name (optional)</span>
                <input
                  value={recallBotName}
                  onChange={(e) => setRecallBotName(e.target.value)}
                  placeholder="Notetaker"
                  className="w-full text-xs font-mono px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300"
                />
              </label>

              <label className="space-y-1 block sm:col-span-2">
                <span className="text-[11px] font-mono text-zinc-400 dark:text-zinc-600 uppercase tracking-wider">Webhook signing secret</span>
                <input
                  type="password"
                  value={recallSigningSecret}
                  onChange={(e) => setRecallSigningSecret(e.target.value)}
                  placeholder="whsec_..."
                  className="w-full text-xs font-mono px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300"
                />
                <p className="text-[10px] font-mono text-zinc-400 dark:text-zinc-600 leading-relaxed">
                  From this client&apos;s Recall.ai dashboard → Webhooks. Point that webhook at{" "}
                  <span
                    className="text-zinc-600 dark:text-zinc-400"
                    suppressHydrationWarning
                  >
                    {typeof window !== "undefined" ? window.location.origin : ""}/api/recall
                  </span>{" "}
                  and paste the signing secret shown there — without it, incoming call events fail signature verification and get rejected.
                </p>
              </label>

              <p className="text-[10px] font-mono text-amber-600 dark:text-amber-400 leading-relaxed sm:col-span-2">
                The Recall.ai API key itself is entered separately under &quot;Update credentials&quot; in the Modify menu, not here — this section only holds the connection settings.
              </p>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 pt-1 border-t border-zinc-100 dark:border-zinc-900/50">
        <button
          onClick={save}
          disabled={busy}
          className="inline-flex items-center gap-1.5 text-[11px] font-mono font-bold px-3 py-1.5 rounded bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-white disabled:opacity-50 transition-all cursor-pointer mt-3"
        >
          <Save className="w-3 h-3" /> {busy ? "Saving…" : "Save changes"}
        </button>
        {saved && <span className="text-[11px] font-mono text-ink-hover dark:text-ink mt-3">Saved.</span>}
        {error && <span className="text-[11px] font-mono text-rose-600 dark:text-rose-400 mt-3">{error}</span>}
      </div>
    </div>
  );
}