"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { InputField } from "../../../new/form-fields";
import { TemplatePicker } from "../../../new/steps/template-picker";
import type { FormData as WizardFormData } from "../../../new/types";
import { DEFAULT_FORM } from "../../../new/constants";

/**
 * Pin-Down's hinges panel — reachable from the launch wizard's bridge
 * selection screen (new engagements) or the engagement detail page's
 * Skills panel (enabling Pin-Down for an already-launched client). Same
 * screen either way; GET pre-fills whatever's already saved.
 */
export default function PinDownBridgePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [buyer, setBuyer] = useState("");

  const [voiceSource, setVoiceSource] = useState<"scrape" | "manual">("scrape");
  const [marketingDomain, setMarketingDomain] = useState("");
  const [rawVoiceCorpus, setRawVoiceCorpus] = useState("");
  const [existingConfirmationPageUrl, setExistingConfirmationPageUrl] = useState("");
  const [existingConfirmationPageReuse, setExistingConfirmationPageReuse] = useState(false);
  const [confirmationPageTemplate, setConfirmationPageTemplate] = useState("signal");
  const [existingPileOnSequenceFlagged, setExistingPileOnSequenceFlagged] = useState(false);
  const [existingAuditFlagged, setExistingAuditFlagged] = useState(false);
  const [existingAuditDescription, setExistingAuditDescription] = useState("");
  const [notificationPackSelections, setNotificationPackSelections] = useState<string[]>([]);
  const [emailPlatform, setEmailPlatform] = useState("");

  // TemplatePicker previews using real offer/testimonial data when it can —
  // it falls back to placeholder demo copy for anything left empty, so a
  // partial object (this route doesn't own those fields) still renders fine.
  const [previewData, setPreviewData] = useState<WizardFormData>(DEFAULT_FORM);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/engagements/${id}/bridges/pin-down`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load");
        if (cancelled) return;

        setBuyer(data.buyer ?? "");
        setMarketingDomain(data.marketingDomain ?? "");
        if (data.marketingDomain) setVoiceSource("scrape");
        setRawVoiceCorpus(data.rawVoiceCorpus ?? "");
        setExistingConfirmationPageUrl(data.existingConfirmationPageUrl ?? "");
        setExistingConfirmationPageReuse(data.existingConfirmationPageReuse ?? false);
        setConfirmationPageTemplate(data.confirmationPageTemplate ?? "signal");
        setExistingPileOnSequenceFlagged(data.existingPileOnSequenceFlagged ?? false);
        setExistingAuditFlagged(data.existingAuditFlagged ?? false);
        setExistingAuditDescription(data.existingAuditDescription ?? "");
        setNotificationPackSelections(data.notificationPackSelections ?? []);
        setEmailPlatform(data.emailPlatform ?? "");
        setPreviewData((p) => ({
          ...p,
          buyerName: data.buyer ?? "",
          offerName: data.offerDetails?.name ?? "",
          offerPrice: data.offerDetails?.price ?? "",
          offerIcp: data.offerDetails?.icp ?? "",
          trafficTemperature: data.offerDetails?.traffic_temperature ?? "warm",
          confirmationPageTemplate: data.confirmationPageTemplate ?? "signal",
        }));
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

  const wordCount = rawVoiceCorpus.trim().split(/\s+/).filter(Boolean).length;
  const canSubmit = voiceSource === "scrape" ? marketingDomain.trim().length > 0 : wordCount >= 50;

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/engagements/${id}/bridges/pin-down`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voiceSource,
          marketingDomain,
          rawVoiceCorpus,
          existingConfirmationPageUrl,
          existingConfirmationPageReuse,
          confirmationPageTemplate,
          existingPileOnSequenceFlagged,
          existingAuditFlagged,
          existingAuditDescription,
          notificationPackSelections,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error ?? "Couldn't save. Nothing else was affected.");
        setSaving(false);
        return;
      }
      router.push(data.runId ? `/dashboard/runs/${data.runId}` : `/dashboard/engagements/${id}`);
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
          Configure Pin-Down{buyer ? ` for ${buyer}` : ""}
        </h1>
        <p className="text-xs font-normal mt-0.5" style={{ color: "var(--text-muted)" }}>
          How to learn the brand voice, and which confirmation page design to ship. Saving turns Pin-Down on and runs it
          immediately — you&apos;ll land on a live status page right after.
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-semibold block" style={{ color: "var(--text-primary)" }}>
          How should we learn this client&apos;s voice?
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setVoiceSource("scrape")}
            className={`flex-1 text-left px-4 py-3 rounded-lg text-xs transition-all cursor-pointer shadow-xs border ${
              voiceSource === "scrape"
                ? "bg-zinc-100 border-zinc-900 text-zinc-900 dark:bg-zinc-800 dark:border-zinc-100 dark:text-zinc-100 font-semibold"
                : "bg-white border-zinc-200 text-zinc-600 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-700"
            }`}
          >
            <span className="font-bold uppercase tracking-wider font-mono block">Scrape their website</span>
            <p className={`mt-1 leading-relaxed font-normal ${voiceSource === "scrape" ? "text-zinc-700 dark:text-zinc-300" : "text-zinc-500 dark:text-zinc-400"}`}>
              We crawl their site (and recent broadcast emails, if Klaviyo is connected) automatically. Pasting a sample too still helps if the crawl comes up short.
            </p>
          </button>
          <button
            type="button"
            onClick={() => setVoiceSource("manual")}
            className={`flex-1 text-left px-4 py-3 rounded-lg text-xs transition-all cursor-pointer shadow-xs border ${
              voiceSource === "manual"
                ? "bg-zinc-100 border-zinc-900 text-zinc-900 dark:bg-zinc-800 dark:border-zinc-100 dark:text-zinc-100 font-semibold"
                : "bg-white border-zinc-200 text-zinc-600 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-700"
            }`}
          >
            <span className="font-bold uppercase tracking-wider font-mono block">Paste a writing sample</span>
            <p className={`mt-1 leading-relaxed font-normal ${voiceSource === "manual" ? "text-zinc-700 dark:text-zinc-300" : "text-zinc-500 dark:text-zinc-400"}`}>
              Sales copy, call transcripts, or email examples — ready to use right now.
            </p>
          </button>
        </div>
      </div>

      {voiceSource === "scrape" && (
        <InputField
          label="Marketing website"
          value={marketingDomain}
          onChange={setMarketingDomain}
          placeholder="yoursite.com"
          helpText="We'll crawl this site (and pricing/sales pages if we find them) to build the voice profile."
          required
        />
      )}

      <InputField
        label="Existing confirmation page (if any)"
        value={existingConfirmationPageUrl}
        onChange={setExistingConfirmationPageUrl}
        placeholder="https://yoursite.com/thank-you"
        helpText="If the client already has a post-booking confirmation page live, paste its URL — we'll audit it against the new one."
      />

      {existingConfirmationPageUrl && (
        <label className="flex items-start gap-2 text-xs cursor-pointer -mt-2" style={{ color: "var(--text-secondary)" }}>
          <input
            type="checkbox"
            checked={existingConfirmationPageReuse}
            onChange={(e) => setExistingConfirmationPageReuse(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            Keep using this page — don&apos;t build or publish a new one. We&apos;ll still run the audit above so you
            can see what&apos;s missing, but nothing gets deployed to {buyer || "the client"}&apos;s site.
          </span>
        </label>
      )}

      <div className="space-y-1.5 w-full">
        <label className="text-xs font-semibold block" style={{ color: "var(--text-primary)" }}>
          Sales copy, scripts, or call transcripts (500 words minimum)
        </label>
        <textarea
          value={rawVoiceCorpus}
          onChange={(e) => setRawVoiceCorpus(e.target.value)}
          placeholder="Paste sales call transcripts, email copy, or scripts here..."
          rows={8}
          className="w-full rounded-lg px-3 py-2 text-xs resize-y transition-colors shadow-xs placeholder:text-zinc-400 dark:placeholder:text-zinc-600 font-medium"
          style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
        />
        <p className="text-[11px] font-mono font-bold" style={{ color: "var(--text-muted)" }}>
          {wordCount} words pasted.{" "}
          {voiceSource === "manual" && wordCount < 50
            ? "Add more — at least 500 words are needed to learn the brand voice accurately."
            : voiceSource === "manual"
            ? "✓ That's enough to learn the brand voice."
            : "Optional — helps if the crawl comes up short."}
        </p>
      </div>

      {!existingConfirmationPageReuse && (
      <div className="space-y-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider font-mono" style={{ color: "var(--text-primary)" }}>
            Choose a confirmation page design
          </h2>
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            The page {buyer || "the client"}&apos;s prospects land on after booking. It regenerates with real call data
            once Pin-Down runs.
          </p>
        </div>
        <TemplatePicker form={previewData} onSelect={setConfirmationPageTemplate} />
      </div>
      )}

      <div className="space-y-3 pt-2" style={{ borderTop: "1px solid var(--border)" }}>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          A few things Pin-Down checks once, during setup, on behalf of Pile-On and Leak Map — so their results are
          ready before you ever turn those on.
        </p>

        <label className="flex items-start gap-2 text-xs cursor-pointer" style={{ color: "var(--text-secondary)" }}>
          <input
            type="checkbox"
            checked={existingPileOnSequenceFlagged}
            onChange={(e) => setExistingPileOnSequenceFlagged(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            This client already has a pre-call email sequence running on {emailPlatform || "their ESP"}.{" "}
            We&apos;ll audit it (Klaviyo/HubSpot only) and show a keep/replace/merge/drop recommendation per email
            before anything new goes live.
          </span>
        </label>

        <label className="flex items-start gap-2 text-xs cursor-pointer" style={{ color: "var(--text-secondary)" }}>
          <input
            type="checkbox"
            checked={existingAuditFlagged}
            onChange={(e) => setExistingAuditFlagged(e.target.checked)}
            className="mt-0.5"
          />
          <span>This client already has a dashboard, KPI report, or audit process we should know about.</span>
        </label>
        {existingAuditFlagged && (
          <InputField
            label="Describe their existing report"
            value={existingAuditDescription}
            onChange={setExistingAuditDescription}
            placeholder="e.g. A weekly Google Sheet tracking show-rate and close-rate, reviewed manually every Monday."
            helpText="We'll compare it against what Leak Map covers and show the overlap — never replaces or modifies what's already there."
          />
        )}

        <div>
          <label className="text-xs font-semibold block mb-2" style={{ color: "var(--text-primary)" }}>
            Notification pack (optional)
          </label>
          <p className="text-[11px] font-mono mb-2" style={{ color: "var(--text-muted)" }}>
            Curated Leak Map alerts you can activate now — nothing fires unless checked. Thresholds can be adjusted later.
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
                  checked={notificationPackSelections.includes(pack.id)}
                  onChange={(e) =>
                    setNotificationPackSelections((prev) =>
                      e.target.checked ? [...prev, pack.id] : prev.filter((id) => id !== pack.id)
                    )
                  }
                />
                {pack.label}
              </label>
            ))}
          </div>
        </div>
      </div>

      {saveError && (
        <p className="text-xs font-mono font-semibold" style={{ color: "var(--error)" }}>
          ⚠ Error: {saveError}
        </p>
      )}

      <div className="flex justify-end pt-4 font-mono" style={{ borderTop: "1px solid var(--border)" }}>
        <button
          onClick={save}
          disabled={saving || !canSubmit}
          className="px-5 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer bg-zinc-900 hover:bg-zinc-800 text-zinc-50 dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900 disabled:opacity-40 disabled:cursor-not-allowed shadow-xs active:translate-y-px"
        >
          {saving ? "Saving..." : "Save & Run Pin-Down"}
        </button>
      </div>
    </div>
  );
}