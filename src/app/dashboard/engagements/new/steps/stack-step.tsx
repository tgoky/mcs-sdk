import type { Dispatch, SetStateAction } from "react";
import { InputField, SelectField } from "../form-fields";
import { BOOKING_PLATFORM_LABELS, EMAIL_PLATFORM_LABELS, HOSTING_PLATFORM_LABELS } from "@/lib/copy";
import type { FormData } from "../types";

// NOTE: Klaviyo/ActiveCampaign/GHL/Mailchimp/ConvertKit list & workflow
// selection used to live in this step. It's been moved to
// credentials-step.tsx, directly beneath each platform's API key field —
// those dropdowns need a live API key to fetch their options, and the key
// is entered on the credentials step, not here. See
// use-email-integrations.ts for the fetch logic.
export function StackStep({
  form,
  set,
  setForm,
}: {
  form: FormData;
  set: (field: keyof FormData, value: string | boolean) => void;
  setForm: Dispatch<SetStateAction<FormData>>;
}) {
  return (
    <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
      <SelectField
        label="Booking Calendar"
        value={form.bookingPlatform}
        onChange={(v) => set("bookingPlatform", v)}
        options={Object.entries(BOOKING_PLATFORM_LABELS).map(([value, label]) => ({ value, label }))}
        helpText="The tool your client uses to schedule calls."
      />

      {form.bookingPlatform === "calendly" && (
        <div className="md:col-span-2 rounded-lg p-3 text-xs shadow-xs font-mono font-medium" style={{ background: "var(--accent-dim)", color: "var(--text-secondary)" }}>
          <strong>Zero-Config Mode Active:</strong> You don&apos;t need to look up or paste any organization links or event IDs. We automatically detect your workspace parameters.
        </div>
      )}

      {form.bookingPlatform === "cal_com" && (
        <div className="md:col-span-2 rounded-lg p-3 text-xs shadow-xs font-mono font-medium" style={{ background: "var(--accent-dim)", color: "var(--text-secondary)" }}>
          ✨ <strong>Zero-Config Mode Active:</strong> We will automatically parse your account username and event context from the standing link behind the scenes.
        </div>
      )}

      {form.bookingPlatform === "ghl_calendar" && (
        <InputField
          label="GoHighLevel Location ID"
          value={form.bookingLocationId}
          onChange={(v) => set("bookingLocationId", v)}
          placeholder="e.g. loc_abc123"
          helpText="Found in GoHighLevel under your sub-account settings."
        />
      )}

      {form.bookingPlatform === "discover_from_docs" && (
        <>
          <div className="md:col-span-2 rounded-lg p-3 text-xs shadow-xs font-mono font-medium" style={{ background: "var(--accent-dim)", color: "var(--text-secondary)" }}>
            We'll research this platform's public developer docs and draft an integration proposal for review — it won't touch your client's account until an admin approves it. Bookings on this platform won't auto-enroll until then.
          </div>
          <InputField
            label="Platform name"
            value={form.discoveredPlatformName}
            onChange={(v) => set("discoveredPlatformName", v)}
            placeholder="e.g. Acuity Scheduling"
            helpText="Whatever your client actually uses."
          />
          <InputField
            label="Platform website"
            value={form.discoveredPlatformWebsite}
            onChange={(v) => set("discoveredPlatformWebsite", v)}
            placeholder="https://theirplatform.com"
          />
        </>
      )}

      <InputField
        label="Standing booking page link"
        value={form.bookingStandingLink}
        onChange={(v) => set("bookingStandingLink", v)}
        placeholder="https://calendly.com/client/discovery-call"
        helpText="The client's always-open booking page. We'll automatically find the matching event parameters from this link."
      />

      <SelectField
        label="Email Platform"
        value={form.emailPlatform}
        onChange={(v) => set("emailPlatform", v)}
        options={Object.entries(EMAIL_PLATFORM_LABELS).map(([value, label]) => ({ value, label }))}
        helpText="Where follow-up and win-back emails get sent from. List/workflow selection for whichever platform you pick here happens on the next step, right below its API key."
      />

      <SelectField
        label="Where should call briefs go?"
        value={form.briefDestination}
        onChange={(v) => set("briefDestination", v)}
        options={[
          { value: "slack", label: "Slack message" },
          { value: "crm_note", label: "Note in your CRM" },
        ]}
        helpText="Where the AI-written brief lands before each call."
      />

      {form.briefDestination === "slack" && (
        <InputField
          label="Slack Webhook URL"
          value={form.slackWebhookUrl}
          onChange={(v) => set("slackWebhookUrl", v)}
          placeholder="https://hooks.slack.com/services/..."
          helpText="From Slack → your workspace → Incoming Webhooks."
        />
      )}

      <SelectField
        label="Pre-Call Brief Schedule"
        value={form.briefTriggerType}
        onChange={(v) => set("briefTriggerType", v as any)}
        options={[
          {
            value: "nightly",
            label: "Nightly Batch — Group and brief tomorrow's roster at 20:00 UTC"
          },
          {
            value: "dynamic_webhook",
            label: "Dynamic Poll — Brief individually within 15 minutes of entering the lead window"
          },
        ]}
        helpText="Choose 'Dynamic' if your sales reps require briefs to be generated on-demand as soon as an upcoming call crosses into its imminent lead-time window."
      />

      <SelectField
        label="Where is the confirmation page hosted?"
        value={form.hostingPlatform}
        onChange={(v) => set("hostingPlatform", v)}
        options={Object.entries(HOSTING_PLATFORM_LABELS).map(([value, label]) => ({ value, label }))}
        helpText="The confirmation page publishes directly onto the client's own site — it never lives on our domain."
      />

      <InputField
        label="Website Domain"
        value={form.publishDomain}
        onChange={(v) => set("publishDomain", v)}
        placeholder="yoursite.com"
        helpText="Used to build the confirmation link people land on after booking."
      />

      {form.hostingPlatform === "webflow" && (
        <>
          <InputField
            label="Webflow Site ID"
            value={form.hostingWebflowSiteId}
            onChange={(v) => set("hostingWebflowSiteId", v)}
            placeholder="e.g. 5f1a2b3c..."
            helpText="Webflow → Site Settings → General → Site ID."
          />
          <InputField
            label="Webflow Collection ID"
            value={form.hostingWebflowCollectionId}
            onChange={(v) => set("hostingWebflowCollectionId", v)}
            placeholder="e.g. 6a2b3c4d..."
            helpText="The CMS collection the confirmation page item gets created in."
          />
        </>
      )}

      {form.hostingPlatform === "wordpress" && (
        <div className="md:col-span-2">
          <InputField
            label="WordPress Site URL"
            value={form.hostingWordpressSiteUrl}
            onChange={(v) => set("hostingWordpressSiteUrl", v)}
            placeholder="https://client-site.com"
            helpText="The client's WordPress base URL."
          />
        </div>
      )}

      {form.hostingPlatform === "nextjs_vercel" && (
        <>
          <InputField
            label="Vercel Project Name"
            value={form.hostingVercelProjectName}
            onChange={(v) => set("hostingVercelProjectName", v)}
            placeholder="e.g. client-confirmation-page"
            helpText="Deployed under the client's own Vercel account/team, not ours."
          />
          <InputField
            label="Vercel Team ID (optional)"
            value={form.hostingVercelTeamId}
            onChange={(v) => set("hostingVercelTeamId", v)}
            placeholder="e.g. team_abc123"
            helpText="Only needed if the client's Vercel account belongs to a team."
          />
        </>
      )}

      {(form.hostingPlatform === "ghl" || form.hostingPlatform === "plain_html") && (
        <div className="md:col-span-2 rounded-lg p-3 text-xs shadow-xs font-mono font-medium" style={{ background: "var(--accent-dim)", color: "var(--text-secondary)" }}>
          {form.hostingPlatform === "ghl"
            ? "GoHighLevel's funnel builder doesn't support automatic publishing yet. We'll generate the page as ready-to-paste HTML with step-by-step instructions instead."
            : "Plain HTML sites are published manually. We'll generate a self-contained HTML file the client uploads to their own host."}
        </div>
      )}

      {form.hostingPlatform === "discover_from_docs" && (
        <>
          <div className="md:col-span-2 rounded-lg p-3 text-xs shadow-xs font-mono font-medium" style={{ background: "var(--accent-dim)", color: "var(--text-secondary)" }}>
            We'll research this platform's publishing API and draft an integration proposal for review. Until it's approved, the confirmation page ships as ready-to-paste HTML — nothing is blocked in the meantime.
          </div>
          <InputField
            label="Platform name"
            value={form.discoveredPlatformName}
            onChange={(v) => set("discoveredPlatformName", v)}
            placeholder="e.g. Squarespace"
            helpText="Whatever your client actually uses."
          />
          <InputField
            label="Platform website"
            value={form.discoveredPlatformWebsite}
            onChange={(v) => set("discoveredPlatformWebsite", v)}
            placeholder="https://theirplatform.com"
          />
        </>
      )}

      {/* Pile-On recovery gap 1 — SMS */}
      <div className="md:col-span-2 pt-4 mt-2 border-t" style={{ borderColor: "var(--border)" }}>
        <label className="text-xs font-bold uppercase tracking-wider block mb-3" style={{ color: "var(--text-muted)" }}>
          SMS Sequence (optional)
        </label>
      </div>
      <SelectField
        label="SMS Platform"
        value={form.smsPlatform}
        onChange={(v) => set("smsPlatform", v)}
        options={[
          { value: "none", label: "No SMS sequence" },
          { value: "twilio", label: "Twilio" },
          { value: "ghl_sms", label: "GoHighLevel SMS" },
          { value: "hubspot_sms", label: "HubSpot SMS" },
        ]}
      />
      {form.smsPlatform !== "none" && (
        <InputField
          label={form.smsPlatform === "twilio" ? "Twilio Auth Token" : form.smsPlatform === "ghl_sms" ? "GoHighLevel API Key" : "HubSpot API Key"}
          value={form.smsApiKey}
          onChange={(v) => set("smsApiKey", v)}
          type="password"
        />
      )}
      {form.smsPlatform === "twilio" && (
        <>
          <InputField
            label="Twilio Account SID"
            value={form.smsTwilioAccountSid}
            onChange={(v) => set("smsTwilioAccountSid", v)}
            placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
          />
          <InputField
            label="Twilio Messaging Service SID"
            value={form.smsTwilioMessagingServiceSid}
            onChange={(v) => set("smsTwilioMessagingServiceSid", v)}
            placeholder="MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            helpText="Preferred over a single From number — Twilio handles number pooling/failover."
          />
          <InputField
            label="Twilio From Number (if no Messaging Service)"
            value={form.smsTwilioFromNumber}
            onChange={(v) => set("smsTwilioFromNumber", v)}
            placeholder="+15551234567"
          />
          <SelectField
            label="A2P 10DLC Status"
            value={form.smsA2p10dlcStatus}
            onChange={(v) => set("smsA2p10dlcStatus", v)}
            options={[
              { value: "not_started", label: "Not started" },
              { value: "brand_registered", label: "Brand registered" },
              { value: "campaign_approved", label: "Campaign approved" },
            ]}
            helpText="Must be 'Campaign approved' or we'll refuse to send — unregistered marketing SMS gets carrier-filtered."
          />
        </>
      )}
      {form.smsPlatform !== "none" && (
        <SelectField
          label="Compliance footer"
          value={form.smsComplianceFooterVariant}
          onChange={(v) => set("smsComplianceFooterVariant", v as "standard" | "custom")}
          options={[
            { value: "standard", label: "Standard (Reply STOP to unsubscribe, HELP for help)" },
            { value: "custom", label: "Custom" },
          ]}
        />
      )}
      {form.smsPlatform !== "none" && form.smsComplianceFooterVariant === "custom" && (
        <InputField
          label="Custom compliance footer"
          value={form.smsComplianceFooterCustom}
          onChange={(v) => set("smsComplianceFooterCustom", v)}
          placeholder="Text STOP to opt out."
        />
      )}

      {/* Pile-On recovery gap 2 — ad-data cohort sync */}
      <div className="md:col-span-2 pt-4 mt-2 border-t" style={{ borderColor: "var(--border)" }}>
        <label className="text-xs font-bold uppercase tracking-wider block mb-3" style={{ color: "var(--text-muted)" }}>
          Ad-Data Cohort Sync (optional)
        </label>
      </div>
      <SelectField
        label="Ad-Data Platform"
        value={form.adDataPlatform}
        onChange={(v) => set("adDataPlatform", v)}
        options={[
          { value: "none", label: "No ad-data sync" },
          { value: "hyros", label: "Hyros" },
          { value: "google_sheets", label: "Google Sheets" },
          { value: "native_crm", label: `Tag on ${form.emailPlatform || "email/CRM platform"} (no separate credential)` },
        ]}
      />
      {form.adDataPlatform !== "none" && form.adDataPlatform !== "native_crm" && (
        <InputField
          label={form.adDataPlatform === "hyros" ? "Hyros API Key" : "Google Sheets Access Token"}
          value={form.adDataApiKey}
          onChange={(v) => set("adDataApiKey", v)}
          type="password"
        />
      )}
      {form.adDataPlatform === "hyros" && (
        <InputField
          label="Hyros Account ID (optional)"
          value={form.adDataHyrosAccountId}
          onChange={(v) => set("adDataHyrosAccountId", v)}
        />
      )}
      {form.adDataPlatform === "google_sheets" && (
        <>
          <InputField
            label="Spreadsheet ID"
            value={form.adDataGoogleSheetsSpreadsheetId}
            onChange={(v) => set("adDataGoogleSheetsSpreadsheetId", v)}
            helpText="The long ID in the sheet's URL between /d/ and /edit."
          />
          <InputField
            label="Sheet/tab name"
            value={form.adDataGoogleSheetsSheetName}
            onChange={(v) => set("adDataGoogleSheetsSheetName", v)}
            placeholder="Cohort"
          />
        </>
      )}
      {form.adDataPlatform !== "none" && (
        <InputField
          label="Cohort name/tag (optional)"
          value={form.adDataCohortId}
          onChange={(v) => set("adDataCohortId", v)}
          placeholder="showtime_pile_on_cohort"
          helpText="Defaults to showtime_pile_on_cohort if left blank."
        />
      )}

      {/* Pile-On recovery gap 4 — existing-sequence audit */}
      <div className="md:col-span-2">
        <label className="flex items-start gap-2 text-xs cursor-pointer" style={{ color: "var(--text-secondary)" }}>
          <input
            type="checkbox"
            checked={form.existingPileOnSequenceFlagged}
            onChange={(e) => set("existingPileOnSequenceFlagged", e.target.checked)}
            className="mt-0.5"
          />
          <span>
            This client already has a pre-call email sequence running on {form.emailPlatform || "their ESP"}.
            {" "}We'll audit it (Klaviyo/HubSpot only) and show you a keep/replace/merge/drop recommendation per email before anything new goes live.
          </span>
        </label>
      </div>

      {/* Pre-Call Read recovery gap 3 — video engagement */}
      <div className="md:col-span-2 pt-4 mt-2 border-t" style={{ borderColor: "var(--border)" }}>
        <label className="text-xs font-bold uppercase tracking-wider block mb-3" style={{ color: "var(--text-muted)" }}>
          Video Engagement (optional)
        </label>
      </div>
      <SelectField
        label="Confirmation-page video platform"
        value={form.videoEngagementPlatform}
        onChange={(v) => set("videoEngagementPlatform", v)}
        options={[
          { value: "none", label: "No video engagement tracking" },
          { value: "vidalytics", label: "Vidalytics" },
          { value: "wistia", label: "Wistia" },
          { value: "youtube_analytics", label: "YouTube (aggregate stats only)" },
          { value: "loom", label: "Loom (no analytics API available)" },
        ]}
        helpText="Vidalytics/Wistia give per-prospect watch data if your video embed passes their email. YouTube can only report aggregate stats, and Loom has no analytics API at all — both are still trackable here for completeness, just with that caveat."
      />
      {(form.videoEngagementPlatform === "vidalytics" || form.videoEngagementPlatform === "wistia" || form.videoEngagementPlatform === "youtube_analytics") && (
        <InputField
          label={`${form.videoEngagementPlatform === "youtube_analytics" ? "Google" : form.videoEngagementPlatform === "vidalytics" ? "Vidalytics" : "Wistia"} API Key`}
          value={form.videoEngagementApiKey}
          onChange={(v) => set("videoEngagementApiKey", v)}
          type="password"
        />
      )}
      {form.videoEngagementPlatform === "vidalytics" && (
        <InputField
          label="Confirmation-page video ID"
          value={form.heroVideoId}
          onChange={(v) => set("heroVideoId", v)}
        />
      )}
      {form.videoEngagementPlatform === "wistia" && (
        <InputField
          label="Wistia video ID"
          value={form.videoEngagementWistiaVideoId}
          onChange={(v) => set("videoEngagementWistiaVideoId", v)}
        />
      )}
      {form.videoEngagementPlatform === "youtube_analytics" && (
        <>
          <InputField
            label="YouTube channel ID"
            value={form.videoEngagementYoutubeChannelId}
            onChange={(v) => set("videoEngagementYoutubeChannelId", v)}
          />
          <InputField
            label="Confirmation-page video ID"
            value={form.heroVideoId}
            onChange={(v) => set("heroVideoId", v)}
          />
        </>
      )}

      {/* Pre-Call Read recovery gap 5 — Apollo/PDL BYOK */}
      <div className="md:col-span-2 pt-4 mt-2 border-t" style={{ borderColor: "var(--border)" }}>
        <label className="text-xs font-bold uppercase tracking-wider block mb-3" style={{ color: "var(--text-muted)" }}>
          Prospect Research BYOK (optional)
        </label>
        <p className="text-[11px] font-mono mb-3" style={{ color: "var(--text-muted)" }}>
          If your client already has their own Apollo or PDL subscription, we'll layer it on top of standard web research — never a required cost.
        </p>
      </div>
      <div className="md:col-span-2 flex gap-4">
        <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: "var(--text-secondary)" }}>
          <input
            type="checkbox"
            checked={form.prospectResearchSourcesUsed.includes("apollo")}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                prospectResearchSourcesUsed: e.target.checked
                  ? [...f.prospectResearchSourcesUsed, "apollo"]
                  : f.prospectResearchSourcesUsed.filter((s) => s !== "apollo"),
              }))
            }
          />
          Apollo
        </label>
        <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: "var(--text-secondary)" }}>
          <input
            type="checkbox"
            checked={form.prospectResearchSourcesUsed.includes("pdl")}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                prospectResearchSourcesUsed: e.target.checked
                  ? [...f.prospectResearchSourcesUsed, "pdl"]
                  : f.prospectResearchSourcesUsed.filter((s) => s !== "pdl"),
              }))
            }
          />
          People Data Labs
        </label>
      </div>
      {form.prospectResearchSourcesUsed.includes("apollo") && (
        <InputField label="Apollo API Key" value={form.apolloApiKey} onChange={(v) => set("apolloApiKey", v)} type="password" />
      )}
      {form.prospectResearchSourcesUsed.includes("pdl") && (
        <InputField label="PDL API Key" value={form.pdlApiKey} onChange={(v) => set("pdlApiKey", v)} type="password" />
      )}

      {/* Win-Back recovery gaps 3, 4, 6 */}
      <div className="md:col-span-2 pt-4 mt-2 border-t" style={{ borderColor: "var(--border)" }}>
        <label className="text-xs font-bold uppercase tracking-wider block mb-3" style={{ color: "var(--text-muted)" }}>
          Win-Back Recovery (optional)
        </label>
      </div>
      <SelectField
        label="Reschedule link mode"
        value={form.rescheduleMode}
        onChange={(v) => set("rescheduleMode", v as "fresh_link" | "time_slots")}
        options={[
          { value: "time_slots", label: "Live available slots (default)" },
          { value: "fresh_link", label: "Per-prospect single-use link (Calendly/Cal.com only)" },
        ]}
        helpText="fresh_link uses the platform's own per-booking reschedule link when available (Calendly, Cal.com), falling back to live slots per prospect when it isn't (GHL, OnceHub)."
      />
      <div className="md:col-span-2">
        <label className="flex items-start gap-2 text-xs cursor-pointer" style={{ color: "var(--text-secondary)" }}>
          <input
            type="checkbox"
            checked={form.recoveredFromNoShowTaggingEnabled}
            onChange={(e) => set("recoveredFromNoShowTaggingEnabled", e.target.checked)}
            className="mt-0.5"
          />
          <span>Tag prospects as "recovered from no-show" on {form.emailPlatform || "the ESP"} when they rebook during an active recovery window.</span>
        </label>
      </div>
      <SelectField
        label="Reply detection (exits the recovery cadence)"
        value={form.inboundReplyMode}
        onChange={(v) => set("inboundReplyMode", v as "native" | "forwarding" | "none")}
        options={[
          { value: "none", label: "Off — cadence only stops on rebook or window elapse" },
          { value: "forwarding", label: "Forwarding — client forwards replies through an inbound-parse bridge" },
          { value: "native", label: "Native — HubSpot Conversations only" },
        ]}
        helpText={
          form.inboundReplyMode === "native" && form.emailPlatform !== "hubspot"
            ? "Native mode only works with HubSpot — Klaviyo and ActiveCampaign don't expose a stable reply webhook, use forwarding instead."
            : "A reply of any kind halts the win-back cadence for that prospect — table stakes for anything calling itself win-back."
        }
      />
      {form.inboundReplyMode === "native" && form.emailPlatform === "hubspot" && (
        <InputField
          label="HubSpot Portal ID"
          value={form.hubspotPortalId}
          onChange={(v) => set("hubspotPortalId", v)}
          helpText="Settings → Account Setup → Account Defaults in your client's HubSpot account."
        />
      )}
      {form.inboundReplyMode === "forwarding" && (
        <div className="md:col-span-2 rounded-lg p-3 text-xs shadow-xs font-mono font-medium" style={{ background: "var(--accent-dim)", color: "var(--text-secondary)" }}>
          We'll generate a unique catcher URL once Win-Back is set up — point your client's Postmark/SendGrid inbound-parse bridge (or a forwarding rule through one) at it.
        </div>
      )}

      {/* Leak Map recovery gaps 1, 2, 3, 4 */}
      <div className="md:col-span-2 pt-4 mt-2 border-t" style={{ borderColor: "var(--border)" }}>
        <label className="text-xs font-bold uppercase tracking-wider block mb-3" style={{ color: "var(--text-muted)" }}>
          Leak Map Reporting
        </label>
      </div>
      <SelectField
        label="Weekly summary — day"
        value={String(form.weeklyScheduleDayOfWeek)}
        onChange={(v) => set("weeklyScheduleDayOfWeek", Number(v) as any)}
        options={[
          { value: "0", label: "Sunday" }, { value: "1", label: "Monday" }, { value: "2", label: "Tuesday" },
          { value: "3", label: "Wednesday" }, { value: "4", label: "Thursday" }, { value: "5", label: "Friday" }, { value: "6", label: "Saturday" },
        ]}
      />
      <SelectField
        label="Report hour (local)"
        value={String(form.weeklyScheduleHour)}
        onChange={(v) => set("weeklyScheduleHour", Number(v) as any)}
        options={Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: `${h.toString().padStart(2, "0")}:00` }))}
        helpText="Used for both the weekly summary and monthly deep-dive."
      />
      <SelectField
        label="Monthly deep-dive — day of month"
        value={String(form.monthlyScheduleDayOfMonth)}
        onChange={(v) => set("monthlyScheduleDayOfMonth", Number(v) as any)}
        options={Array.from({ length: 28 }, (_, d) => ({ value: String(d + 1), label: String(d + 1) }))}
        helpText="Capped at 28 so it fires reliably every month, including February."
      />
      <InputField
        label="Timezone"
        value={form.leakMapTimezone}
        onChange={(v) => set("leakMapTimezone", v)}
        placeholder="America/New_York"
        helpText="IANA timezone name. Defaults to UTC."
      />
      <SelectField
        label="Report delivery"
        value={form.auditOutputFormat}
        onChange={(v) => set("auditOutputFormat", v as any)}
        options={[
          { value: "dashboard_only", label: "Dashboard only" },
          { value: "slack", label: "Slack" },
          { value: "email", label: "Email" },
        ]}
      />
      {form.auditOutputFormat === "email" && (
        <InputField
          label="Report recipient email"
          value={form.leakMapReportEmail}
          onChange={(v) => set("leakMapReportEmail", v)}
          placeholder="ops@client.com"
        />
      )}
      {form.auditOutputFormat === "slack" && !form.slackWebhookUrl && (
        <div className="md:col-span-2 rounded-lg p-3 text-xs shadow-xs font-mono font-medium" style={{ background: "var(--accent-dim)", color: "var(--text-secondary)" }}>
          Slack delivery uses the Slack webhook URL from the Pre-Call Read brief settings above — add one there if you haven't yet.
        </div>
      )}

      <div className="md:col-span-2">
        <label className="flex items-start gap-2 text-xs cursor-pointer" style={{ color: "var(--text-secondary)" }}>
          <input
            type="checkbox"
            checked={form.existingAuditFlagged}
            onChange={(e) => set("existingAuditFlagged", e.target.checked)}
            className="mt-0.5"
          />
          <span>This client already has a dashboard, KPI report, or audit process we should know about.</span>
        </label>
      </div>
      {form.existingAuditFlagged && (
        <div className="md:col-span-2">
          <InputField
            label="Describe their existing report"
            value={form.existingAuditDescription}
            onChange={(v) => set("existingAuditDescription", v)}
            placeholder="e.g. A weekly Google Sheet tracking show-rate and close-rate, reviewed manually every Monday."
            helpText="We'll compare it against what Leak Map covers and show you the overlap — never replaces or modifies what's already there."
          />
        </div>
      )}

      <div className="md:col-span-2">
        <label className="text-xs font-semibold block mb-2" style={{ color: "var(--text-primary)" }}>
          Notification pack (optional)
        </label>
        <p className="text-[11px] font-mono mb-2" style={{ color: "var(--text-muted)" }}>
          Curated alerts you can activate now — nothing fires unless checked. Thresholds can be adjusted later.
        </p>
        <div className="space-y-2">
          {[
            { id: "low_identity_confidence", label: "Identity match confidence dropping below 70" },
            { id: "show_rate_drop", label: "Booking show-rate falling below 50%" },
            { id: "email_open_rate_drop", label: "Email open-rate falling below 25%" },
            { id: "pipeline_win_rate_drop", label: "CRM pipeline win-rate falling below 20%" },
            { id: "brief_volume_drop", label: "Brief delivery volume dropping 10%+ week over week" },
          ].map((pack) => (
            <label key={pack.id} className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: "var(--text-secondary)" }}>
              <input
                type="checkbox"
                checked={form.notificationPackSelections.includes(pack.id)}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    notificationPackSelections: e.target.checked
                      ? [...f.notificationPackSelections, pack.id]
                      : f.notificationPackSelections.filter((id) => id !== pack.id),
                  }))
                }
              />
              {pack.label}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
