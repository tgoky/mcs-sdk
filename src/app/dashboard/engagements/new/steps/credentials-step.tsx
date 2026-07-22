import { InputField, SelectField } from "../form-fields";
import { BOOKING_PLATFORM_LABELS, EMAIL_PLATFORM_LABELS, HOSTING_PLATFORM_LABELS } from "@/lib/copy";
import type { FormData, RemoteOption } from "../types";

export function CredentialsStep({
  form,
  set,
  klaviyoLists,
  fetchingLists,
  listsFetchError,
  klaviyoMissingKeyMessage,
  acLists,
  fetchingAcLists,
  acListsError,
  ghlLocations,
  fetchingGhlLocations,
  ghlLocationsError,
  ghlWorkflows,
  fetchingGhlWorkflows,
  ghlWorkflowsError,
}: {
  form: FormData;
  set: (field: keyof FormData, value: string | boolean) => void;
  klaviyoLists: RemoteOption[];
  fetchingLists: boolean;
  listsFetchError: string | null;
  klaviyoMissingKeyMessage: string | null;
  acLists: RemoteOption[];
  fetchingAcLists: boolean;
  acListsError: string | null;
  ghlLocations: RemoteOption[];
  fetchingGhlLocations: boolean;
  ghlLocationsError: string | null;
  ghlWorkflows: RemoteOption[];
  fetchingGhlWorkflows: boolean;
  ghlWorkflowsError: string | null;
}) {
  return (
    <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
      <div className="md:col-span-2 text-xs font-mono">
        <p className="font-bold uppercase tracking-wider" style={{ color: "var(--text-primary)" }}>How we keep this secure</p>
        <p className="font-medium mt-0.5" style={{ color: "var(--text-muted)" }}>
          Your keys are encrypted before they&apos;re stored, and aren&apos;t shown again once saved.
        </p>
      </div>
      <InputField
        label={`${BOOKING_PLATFORM_LABELS[form.bookingPlatform] ?? form.bookingPlatform} API Key`}
        value={form.bookingApiKey}
        onChange={(v) => set("bookingApiKey", v)}
        type="password"
        placeholder="Paste your API key here..."
        helpText={form.bookingPlatform === "calendly" ? "From Calendly → Integrations & Apps → API & Webhooks → Personal Access Tokens." : undefined}
        required
      />
      {form.emailPlatform === "smtp" ? (
        <>
          <div className="md:col-span-2 rounded-lg p-3 text-xs shadow-xs font-mono font-medium" style={{ background: "var(--accent-dim)", color: "var(--text-secondary)" }}>
            Custom SMTP has no single API key — enter your mail server's connection details below. This only runs the Win-Back recovery cadence; Pile-On needs an ESP.
          </div>
          <InputField
            label="SMTP Host"
            value={form.smtpHost}
            onChange={(v) => set("smtpHost", v)}
            placeholder="smtp.yourprovider.com"
            required
          />
          <InputField
            label="SMTP Port"
            value={form.smtpPort}
            onChange={(v) => set("smtpPort", v)}
            placeholder="587"
            required
          />
          <InputField
            label="SMTP Username"
            value={form.smtpUsername}
            onChange={(v) => set("smtpUsername", v)}
            placeholder="mailer@yourdomain.com"
            required
          />
          <InputField
            label="SMTP Password"
            value={form.smtpPassword}
            onChange={(v) => set("smtpPassword", v)}
            type="password"
            placeholder="••••••••"
            required
          />
          <InputField
            label="From address"
            value={form.smtpFromAddress}
            onChange={(v) => set("smtpFromAddress", v)}
            placeholder="hello@yourdomain.com"
            required
          />
          <InputField
            label="From name (optional)"
            value={form.smtpFromName}
            onChange={(v) => set("smtpFromName", v)}
            placeholder="Your Company"
          />
          <div className="flex items-start space-x-3 md:col-span-2 select-none">
            <input
              type="checkbox"
              id="smtpSecure"
              checked={form.smtpSecure}
              onChange={(e) => set("smtpSecure", e.target.checked)}
              className="w-4 h-4 rounded cursor-pointer mt-0.5 border border-zinc-300 dark:border-zinc-800"
              style={{ accentColor: "var(--accent)" }}
            />
            <label htmlFor="smtpSecure" className="text-xs cursor-pointer leading-normal" style={{ color: "var(--text-secondary)" }}>
              Use implicit TLS (typically port 465). Leave unchecked for STARTTLS on 587.
            </label>
          </div>
        </>
      ) : (
        <>
          <InputField
            label={`${EMAIL_PLATFORM_LABELS[form.emailPlatform] ?? form.emailPlatform} API Key`}
            value={form.emailApiKey}
            onChange={(v) => set("emailApiKey", v)}
            type="password"
            placeholder="Paste your API key here..."
            required
          />

          {/* Lists/workflows for whichever email platform is selected — kept
              directly beneath the API key field above so the fetch has a
              key to use the moment it's pasted in. */}
          {form.emailPlatform === "klaviyo" && (
            <>
              {fetchingLists && (
                <div className="md:col-span-2 text-xs italic font-mono text-zinc-500 dark:text-zinc-400 animate-pulse">
                  ⚡ Contacting Klaviyo... Synchronizing list profile parameters...
                </div>
              )}
              {(klaviyoMissingKeyMessage ?? listsFetchError) && (
                <div className="md:col-span-2 rounded p-3 text-xs font-mono border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 shadow-sm animate-in fade-in-40">
                  ⚠ Warning: {klaviyoMissingKeyMessage ?? listsFetchError}
                </div>
              )}

              <SelectField
                label="Klaviyo Target List (Pile-On)"
                value={form.emailTargetListId}
                onChange={(v) => set("emailTargetListId", v)}
                required
                options={[
                  { value: "", label: "-- Choose an Active Klaviyo Audience --" },
                  ...klaviyoLists.map((l) => ({ value: l.id, label: `${l.name} (${l.id})` }))
                ]}
                helpText="Select the target list that houses your main pre-call nurture follow-up flow configuration."
              />
              <SelectField
                label="Klaviyo Recovery List (Win-Back)"
                value={form.emailRecoveryListId}
                onChange={(v) => set("emailRecoveryListId", v)}
                required
                options={[
                  { value: "", label: "-- Choose an Active Klaviyo Audience --" },
                  ...klaviyoLists.map((l) => ({ value: l.id, label: `${l.name} (${l.id})` }))
                ]}
                helpText="Select the audience list configured to lock in canceled no-show recoveries."
              />
              <SelectField
                label="Klaviyo Long-Term Nurture List"
                value={form.longTermNurtureListId}
                onChange={(v) => set("longTermNurtureListId", v)}
                options={[
                  { value: "", label: "-- Choose a Long-Term Nurture List (Optional) --" },
                  ...klaviyoLists.map((l) => ({ value: l.id, label: `${l.name} (${l.id})` }))
                ]}
                helpText="Select the list where prospects should be auto-enrolled when their 30-day win-back window expires."
              />
            </>
          )}

          {form.emailPlatform === "activecampaign" && (
            <>
              <InputField
                label="ActiveCampaign API Access URL"
                value={form.emailActiveCampaignBaseUrl}
                onChange={(v) => set("emailActiveCampaignBaseUrl", v)}
                placeholder="https://account.api-us1.com/api/3"
                helpText="Your unique tracking endpoint link. Found under Settings → Developer → API Access. Lists will auto-populate below once entered."
                required
              />

              {fetchingAcLists && (
                <div className="md:col-span-2 text-xs italic font-mono text-zinc-500 dark:text-zinc-400 animate-pulse">
                  ⚡ Contacting ActiveCampaign... Fetching audience lists...
                </div>
              )}
              {acListsError && (
                <div className="md:col-span-2 rounded p-3 text-xs font-mono border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 shadow-sm animate-in fade-in-40">
                  ⚠ Warning: {acListsError}
                </div>
              )}

              <SelectField
                label="ActiveCampaign Target List"
                value={form.emailTargetListId}
                onChange={(v) => set("emailTargetListId", v)}
                required
                disabled={!form.emailActiveCampaignBaseUrl.trim() || fetchingAcLists}
                options={[
                  { value: "", label: form.emailActiveCampaignBaseUrl.trim() ? "-- Choose a List --" : "-- Enter API URL above first --" },
                  ...acLists.map((l) => ({ value: l.id, label: `${l.name} (${l.id})` }))
                ]}
                helpText="The audience for your main follow-up sequence."
              />
              <SelectField
                label="ActiveCampaign Recovery List"
                value={form.emailRecoveryListId}
                onChange={(v) => set("emailRecoveryListId", v)}
                required
                disabled={!form.emailActiveCampaignBaseUrl.trim() || fetchingAcLists}
                options={[
                  { value: "", label: form.emailActiveCampaignBaseUrl.trim() ? "-- Choose a List --" : "-- Enter API URL above first --" },
                  ...acLists.map((l) => ({ value: l.id, label: `${l.name} (${l.id})` }))
                ]}
                helpText="The audience for your win-back recovery sequence."
              />
              <InputField
                label="ActiveCampaign Recovery Automation ID"
                value={form.recoveryAutomationId}
                onChange={(v) => set("recoveryAutomationId", v)}
                placeholder="e.g. 12"
                helpText="The numeric ID of your win-back automation flow inside ActiveCampaign, used for direct API exits."
              />
            </>
          )}

          {form.emailPlatform === "mailchimp" && (
            <>
              <InputField
                label="Mailchimp Target Audience ID (Pile-On)"
                value={form.emailTargetListId}
                onChange={(v) => set("emailTargetListId", v)}
                placeholder="e.g. a1b2c3d4e5"
                helpText="Audience ID housing your pre-call nurture flow. Found under Audience → Settings → Audience name and defaults."
                required
              />
              <InputField
                label="Mailchimp Recovery Audience ID (Win-Back)"
                value={form.emailRecoveryListId}
                onChange={(v) => set("emailRecoveryListId", v)}
                placeholder="e.g. f6g7h8i9j0"
                helpText="Audience configured to run your no-show recovery journey."
                required
              />
            </>
          )}

          {form.emailPlatform === "convertkit" && (
            <>
              <InputField
                label="ConvertKit Target Form ID (Pile-On)"
                value={form.emailTargetListId}
                onChange={(v) => set("emailTargetListId", v)}
                placeholder="e.g. 1234567"
                helpText="The form that triggers your pre-call nurture sequence. Found under Grow → Landing Pages & Forms."
                required
              />
              <InputField
                label="ConvertKit Recovery Tag ID (Win-Back)"
                value={form.emailRecoveryListId}
                onChange={(v) => set("emailRecoveryListId", v)}
                placeholder="e.g. 7654321"
                helpText="The tag that triggers your win-back recovery automation. Found under Subscribers → Tags."
                required
              />
            </>
          )}

          {form.emailPlatform === "ghl" && (
            <>
              {fetchingGhlLocations && (
                <div className="md:col-span-2 text-xs italic font-mono text-zinc-500 dark:text-zinc-400 animate-pulse">
                  ⚡ Contacting GoHighLevel... Fetching locations...
                </div>
              )}
              {ghlLocationsError && (
                <div className="md:col-span-2 rounded p-3 text-xs font-mono border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 shadow-sm animate-in fade-in-40">
                  ⚠ Warning: {ghlLocationsError}
                </div>
              )}

              <SelectField
                label="GoHighLevel Location"
                value={form.emailGhlLocationId}
                onChange={(v) => {
                  set("emailGhlLocationId", v);
                  set("emailGhlTargetWorkflowId", "");
                  set("emailGhlRecoveryWorkflowId", "");
                }}
                required
                options={[
                  { value: "", label: "-- Choose a Location --" },
                  ...ghlLocations.map((l) => ({ value: l.id, label: l.name }))
                ]}
                helpText="Your GoHighLevel sub-account. Workflows will load after selection."
              />

              {form.emailGhlLocationId && (
                <>
                  {fetchingGhlWorkflows && (
                    <div className="md:col-span-2 text-xs italic font-mono text-zinc-500 dark:text-zinc-400 animate-pulse">
                      ⚡ Loading workflows for selected location...
                    </div>
                  )}
                  {ghlWorkflowsError && (
                    <div className="md:col-span-2 rounded p-3 text-xs font-mono border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 shadow-sm animate-in fade-in-40">
                      ⚠ Warning: {ghlWorkflowsError}
                    </div>
                  )}

                  <SelectField
                    label="GHL Target Workflow"
                    value={form.emailGhlTargetWorkflowId}
                    onChange={(v) => set("emailGhlTargetWorkflowId", v)}
                    required
                    disabled={fetchingGhlWorkflows}
                    options={[
                      { value: "", label: fetchingGhlWorkflows ? "-- Loading..." : "-- Choose a Workflow --" },
                      ...ghlWorkflows.map((w) => ({ value: w.id, label: w.name }))
                    ]}
                    helpText="The workflow for your pre-call automation."
                  />
                  <SelectField
                    label="GHL Recovery Workflow"
                    value={form.emailGhlRecoveryWorkflowId}
                    onChange={(v) => set("emailGhlRecoveryWorkflowId", v)}
                    required
                    disabled={fetchingGhlWorkflows}
                    options={[
                      { value: "", label: fetchingGhlWorkflows ? "-- Loading..." : "-- Choose a Workflow --" },
                      ...ghlWorkflows.map((w) => ({ value: w.id, label: w.name }))
                    ]}
                    helpText="The workflow for your win-back cancellation sequence."
                  />
                </>
              )}
            </>
          )}
        </>
      )}
      {form.hostingPlatform !== "ghl" && form.hostingPlatform !== "plain_html" && (
        <InputField
          label={`${HOSTING_PLATFORM_LABELS[form.hostingPlatform] ?? form.hostingPlatform} ${form.hostingPlatform === "wordpress" ? "Application Password (user:password)" : "API Token"}`}
          value={form.hostingApiKey}
          onChange={(v) => set("hostingApiKey", v)}
          type="password"
          placeholder="Paste your API key or token here..."
          helpText={form.hostingPlatform === "wordpress" ? "WordPress → Users → Profile → Application Passwords. Format: username:password." : "If this isn't available yet, we'll generate the page as ready-to-paste HTML."}
        />
      )}
    </div>
  );
}
