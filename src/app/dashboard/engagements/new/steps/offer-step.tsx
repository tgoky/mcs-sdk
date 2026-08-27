import { Sparkles } from "lucide-react";
import { InputField, SelectField } from "../form-fields";
import { PrefillLoader } from "@/components/prefill-loader";
import type { FormData } from "../types";

export function OfferStep({
  form,
  set,
  prefillDomain,
  setPrefillDomain,
  prefillLoading,
  prefillError,
  prefillNotes,
  runSmartPrefill,
}: {
  form: FormData;
  set: (field: keyof FormData, value: string | boolean) => void;
  prefillDomain: string;
  setPrefillDomain: (v: string) => void;
  prefillLoading: boolean;
  prefillError: string | null;
  prefillNotes: string[];
  runSmartPrefill: () => void;
}) {
  return (
    <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
      {/* Smart pre-fill "divided zone" — deliberately its own surface
          color (--surface-prefill / --border-prefill, see globals.css)
          so this is unmistakably "the AI part" of the very first screen
          someone sees when creating a client. Scoped to this step only —
          every step after this one is on the normal --surface. */}
      <div
        className={`md:col-span-2 rounded-2xl p-4 space-y-2.5 shadow-xs mb-1 ${prefillLoading ? "prefill-scan" : ""}`}
        style={{ background: "var(--surface-prefill)", border: "1px solid var(--border-prefill)" }}
      >
        <div className="flex items-center gap-2">
          <span
            className="flex items-center justify-center w-6 h-6 rounded-full shrink-0"
            style={{ background: "color-mix(in oklch, var(--text-prefill-accent) 16%, transparent)", color: "var(--text-prefill-accent)" }}
          >
            <Sparkles size={13} />
          </span>
          <label className="text-xs font-bold block" style={{ color: "var(--text-prefill-accent)" }}>
            Smart pre-fill (optional)
          </label>
        </div>
        <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
          Have the clients domain? We will crawl it and suggest values below — review and edit anything before submitting.
        </p>
        <div className="flex gap-2">
          <input
            value={prefillDomain}
            onChange={(e) => setPrefillDomain(e.target.value)}
            placeholder="clientsite.com"
            disabled={prefillLoading}
            className="flex-1 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-1 disabled:opacity-60"
            style={{ background: "var(--surface)", border: "1px solid var(--border-prefill)", color: "var(--text-primary)" }}
          />
          <button
            type="button"
            onClick={runSmartPrefill}
            disabled={prefillLoading || !prefillDomain.trim()}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold font-mono uppercase tracking-wider rounded-lg transition-all cursor-pointer text-white disabled:opacity-60 disabled:cursor-not-allowed shadow-sm shrink-0"
            style={{ background: "var(--text-prefill-accent)" }}
          >
            {prefillLoading && <PrefillLoader size={13} />}
            {prefillLoading ? "Crawling…" : "Pre-fill"}
          </button>
        </div>
        {prefillError && (
          <p className="text-[11px] font-mono" style={{ color: "var(--error)" }}>{prefillError}</p>
        )}
        {prefillNotes.length > 0 && (
          <ul className="text-[11px] list-disc list-inside space-y-0.5" style={{ color: "var(--text-muted)" }}>
            {prefillNotes.map((n, i) => <li key={i}>{n}</li>)}
          </ul>
        )}
      </div>
      <InputField
        label="Client / Company Name"
        value={form.buyerName}
        onChange={(v) => set("buyerName", v)}
        placeholder="e.g. Acme Corporation"
        required
      />
      <InputField
        label="What are you selling?"
        value={form.offerName}
        onChange={(v) => set("offerName", v)}
        placeholder="e.g. Enterprise Consulting Program"
        required
      />
      <InputField
        label="Price"
        value={form.offerPrice}
        onChange={(v) => set("offerPrice", v)}
        placeholder="e.g. $10,000"
      />
      <InputField
        label="Industry / vertical"
        value={form.offerVertical}
        onChange={(v) => set("offerVertical", v)}
        placeholder="e.g. coaching, agency, SaaS, consulting"
        helpText="Powers Leak Map's cross-client benchmarks — how this offer's metrics compare to similar offers, once enough engagements report the same bucket."
      />
      <SelectField
        label="Where are leads coming from?"
        value={form.trafficTemperature}
        onChange={(v) => set("trafficTemperature", v)}
        options={[
          { value: "cold", label: "Cold — outbound outreach or paid ads" },
          { value: "warm", label: "Warm — inbound content or referrals" },
          { value: "hot", label: "Hot — people who already know you" },
        ]}
      />
      <div className="md:col-span-2">
        <InputField
          label="Who's the ideal customer?"
          value={form.offerIcp}
          onChange={(v) => set("offerIcp", v)}
          placeholder="e.g. B2B founders doing $1M-$10M in revenue"
          helpText="A short description of who this offer is built for. Used to personalize follow-ups and briefs."
        />
      </div>
      <InputField
        label="Who runs the calls?"
        value={form.prospectMeets}
        onChange={(v) => set("prospectMeets", v)}
        placeholder="e.g. Lead Strategist"
        helpText="The role or title of whoever takes these calls (e.g. closer, founder, account lead)."
      />

      <div className="flex items-start space-x-3 pt-4 select-none md:col-span-1">
        <input
          type="checkbox"
          id="hybrid"
          checked={form.hybridMode}
          onChange={(e) => set("hybridMode", e.target.checked)}
          className="w-4 h-4 rounded-sm cursor-pointer mt-0.5 border border-zinc-300 dark:border-zinc-800"
          style={{ accentColor: "var(--accent)" }}
        />
        <label htmlFor="hybrid" className="text-xs cursor-pointer leading-normal" style={{ color: "var(--text-secondary)" }}>
          Personalize each booking confirmation using AI, based on who booked the call.
        </label>
      </div>
    </div>
  );
}
