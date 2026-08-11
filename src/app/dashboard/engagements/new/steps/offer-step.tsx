// steps/offer-step.tsx
import { Sparkles } from "lucide-react";
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
      {/* --- NEUMORPHIC / MAGNIFIED BUBBLE SMART PRE-FILL CONTAINER --- */}
      <div className="md:col-span-2 relative overflow-hidden rounded-3xl p-6 md:p-8 text-center transition-all duration-300 bg-gradient-to-b from-white/90 via-zinc-50/70 to-zinc-100/80 dark:from-zinc-900/90 dark:via-zinc-900/60 dark:to-zinc-950/80 backdrop-blur-xl border border-white/60 dark:border-zinc-800/80 shadow-[inset_0_2px_4px_rgba(255,255,255,0.9),inset_0_-2px_4px_rgba(0,0,0,0.04),0_16px_36px_-8px_rgba(0,0,0,0.12)] dark:shadow-[inset_0_1px_2px_rgba(255,255,255,0.15),inset_0_-2px_6px_rgba(0,0,0,0.6),0_16px_36px_-8px_rgba(0,0,0,0.6)]">
        {/* Decorative lens light glare */}
        <div 
          className="pointer-events-none absolute -top-12 -left-12 w-48 h-48 rounded-full bg-gradient-to-br from-white/40 dark:from-white/10 to-transparent blur-2xl" 
          aria-hidden="true" 
        />

        <div className="relative z-10 max-w-lg mx-auto space-y-4">
          {/* Centered Magnified Badge & Big Bold Title */}
          <div className="flex flex-col items-center justify-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-white dark:bg-zinc-900 flex items-center justify-center shadow-[inset_0_2px_4px_rgba(255,255,255,0.8),0_4px_12px_rgba(0,0,0,0.08)] dark:shadow-[inset_0_1px_2px_rgba(255,255,255,0.1),0_4px_12px_rgba(0,0,0,0.4)] border border-zinc-200/80 dark:border-zinc-800">
              <Sparkles className="w-6 h-6 text-zinc-900 dark:text-zinc-100 animate-pulse" />
            </div>
            
            <h2 className="text-xl md:text-2xl font-black uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
              Smart Pre-Fill
            </h2>
            
            <p className="text-xs md:text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed font-medium">
              Have your client&apos;s website domain? We&apos;ll crawl it to suggest values across the wizard—review and edit anything before saving.
            </p>
          </div>

          {/* Centered Neumorphic Pill Input Bar */}
          <div className="pt-2 space-y-3">
            <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-white/80 dark:bg-zinc-950/80 border border-zinc-300/70 dark:border-zinc-800 shadow-[inset_0_2px_4px_rgba(0,0,0,0.06),0_2px_10px_rgba(0,0,0,0.03)] dark:shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] focus-within:ring-2 focus-within:ring-zinc-400 dark:focus-within:ring-zinc-600 transition-all">
              <input
                value={prefillDomain}
                onChange={(e) => setPrefillDomain(e.target.value)}
                placeholder="clientsite.com"
                className="flex-1 bg-transparent px-3 py-2 text-xs md:text-sm font-mono text-center md:text-left text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none"
              />
              <button
                type="button"
                onClick={runSmartPrefill}
                disabled={prefillLoading || !prefillDomain.trim()}
                className="px-5 py-2.5 text-xs font-bold font-mono uppercase tracking-wider rounded-xl transition-all cursor-pointer bg-zinc-900 hover:bg-zinc-800 text-zinc-50 dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900 disabled:opacity-40 disabled:cursor-not-allowed shadow-md hover:shadow-lg active:scale-95 shrink-0"
              >
                {prefillLoading ? "Crawling..." : "Pre-fill"}
              </button>
            </div>

            {prefillError && (
              <p className="text-xs font-mono font-semibold text-rose-500 dark:text-rose-400">
                {prefillError}
              </p>
            )}

            {prefillNotes.length > 0 && (
              <div className="text-left bg-white/60 dark:bg-zinc-900/60 rounded-2xl p-3 border border-zinc-200/70 dark:border-zinc-800/70 text-xs text-zinc-600 dark:text-zinc-400 shadow-inner">
                <ul className="list-disc list-inside space-y-1">
                  {prefillNotes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* --- STANDARD FORM FIELDS BELOW --- */}
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
        helpText="Powers Leak Map's cross-client benchmarks—how this offer's metrics compare to similar offers, once enough engagements report the same bucket."
      />
      <SelectField
        label="Where are leads coming from?"
        value={form.trafficTemperature}
        onChange={(v) => set("trafficTemperature", v)}
        options={[
          { value: "cold", label: "Cold—outbound outreach or paid ads" },
          { value: "warm", label: "Warm—inbound content or referrals" },
          { value: "hot", label: "Hot—people who already know you" },
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