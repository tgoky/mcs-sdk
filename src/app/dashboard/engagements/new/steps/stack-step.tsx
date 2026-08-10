import { InputField, SelectField } from "../form-fields";
import { BOOKING_PLATFORM_LABELS, EMAIL_PLATFORM_LABELS, HOSTING_PLATFORM_LABELS } from "@/lib/copy";
import type { FormData } from "../types";

// NOTE: Klaviyo/ActiveCampaign/GHL/Mailchimp/ConvertKit list & workflow
// selection + Booking calendar selection live in credentials-step.tsx.
// Those dropdowns need a live API key to fetch their options, which is
// entered on the credentials step (Step 3), not here.
export function StackStep({
  form,
  set,
}: {
  form: FormData;
  set: (field: keyof FormData, value: string | boolean) => void;
}) {
  return (
    <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
      {/* ── Booking Calendar Selection ── */}
      <SelectField
        label="Booking Calendar"
        value={form.bookingPlatform}
        onChange={(v) => set("bookingPlatform", v)}
        options={Object.entries(BOOKING_PLATFORM_LABELS).map(([value, label]) => ({ value, label }))}
        helpText="The tool your client uses to schedule calls."
      />

      {/* Auto-Detection Banner for Standard Platforms */}
      {form.bookingPlatform && form.bookingPlatform !== "discover_from_docs" && (
        <div className="md:col-span-2 rounded-lg p-3 text-xs shadow-xs font-mono font-medium" style={{ background: "var(--accent-dim)", color: "var(--text-secondary)" }}>
          ✨ <strong>Auto-Detection Active:</strong> No need to copy-paste URLs or Location IDs. On the next step, entering your API key will automatically fetch your live calendar options for you to choose from.
        </div>
      )}

      {/* Unlisted/Custom Platform Discovery */}
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

      {/* ── Email Platform Selection ── */}
      <SelectField
        label="Email Platform"
        value={form.emailPlatform}
        onChange={(v) => set("emailPlatform", v)}
        options={Object.entries(EMAIL_PLATFORM_LABELS).map(([value, label]) => ({ value, label }))}
        helpText="Where follow-up and win-back emails get sent from. List/workflow selection happens on the next step, right below its API key."
      />

      {/* ── Brief Delivery Settings ── */}
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

      {/* ── Hosting Platform Selection ── */}
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

      {(form.hostingPlatform === "ghl" || form.hostingPlatform === "plain_html" || form.hostingPlatform === "lovable") && (
        <div className="md:col-span-2 rounded-lg p-3 text-xs shadow-xs font-mono font-medium" style={{ background: "var(--accent-dim)", color: "var(--text-secondary)" }}>
          {form.hostingPlatform === "ghl"
            ? "GoHighLevel's funnel builder doesn't support automatic publishing yet. We'll generate the page as ready-to-paste HTML with step-by-step instructions instead."
            : form.hostingPlatform === "lovable"
            ? "Lovable doesn't have a public API for us to publish to directly yet. We'll generate the page content and instructions for pasting it into your Lovable project chat instead."
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
      {form.smsPlatform === "ghl_sms" && (
        <div className="md:col-span-2 rounded-lg p-3 text-xs shadow-xs font-mono font-medium" style={{ background: "var(--accent-dim)", color: "var(--text-secondary)" }}>
          No key needed here — the next step (Account Keys) has one shared GoHighLevel token that covers SMS along with any GHL calendar or email workflow use.
        </div>
      )}
      {form.smsPlatform !== "none" && form.smsPlatform !== "ghl_sms" && (
        <InputField
          label={form.smsPlatform === "twilio" ? "Twilio Auth Token" : "HubSpot API Key"}
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
    </div>
  );
}