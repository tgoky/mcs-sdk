import { InputField, SelectField } from "../form-fields";
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
      <div className="md:col-span-2 rounded-lg p-3 space-y-2 shadow-xs" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
        <label className="text-xs font-semibold block" style={{ color: "var(--text-primary)" }}>
          Smart pre-fill (optional)
        </label>
        <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
          Have the clients domain? We will crawl it and suggest values below — review and edit anything before submitting.
        </p>
        <div className="flex gap-2">
          <input
            value={prefillDomain}
            onChange={(e) => setPrefillDomain(e.target.value)}
            placeholder="clientsite.com"
            className="flex-1 rounded-md px-3 py-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-600"
            style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
          />
          <button
            type="button"
            onClick={runSmartPrefill}
            disabled={prefillLoading || !prefillDomain.trim()}
            className="px-3.5 py-2 text-xs font-bold font-mono uppercase tracking-wider rounded-md transition-all cursor-pointer bg-zinc-900 hover:bg-zinc-800 text-zinc-50 dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm shrink-0"
          >
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
          className="w-4 h-4 rounded cursor-pointer mt-0.5 border border-zinc-300 dark:border-zinc-800"
          style={{ accentColor: "var(--accent)" }}
        />
        <label htmlFor="hybrid" className="text-xs cursor-pointer leading-normal" style={{ color: "var(--text-secondary)" }}>
          Personalize each booking confirmation using AI, based on who booked the call.
        </label>
      </div>
    </div>
  );
}
