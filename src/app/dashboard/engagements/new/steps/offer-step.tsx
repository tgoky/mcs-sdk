import { Sparkles, Globe, Wand2, CheckCircle2 } from "lucide-react";
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
  const hasPrefillNotes = prefillNotes.length > 0;

  return (
    <div className="space-y-6 w-full">
      {/* --- SMART AI PRE-FILL HERO BANNER --- */}
      <div
        className={`relative overflow-hidden rounded-2xl p-5 border shadow-sm transition-all duration-300 ${
          prefillLoading ? "prefill-scan ring-2 ring-indigo-500/20" : ""
        }`}
        style={{
          background: "var(--surface-prefill)",
          borderColor: "var(--border-prefill)",
        }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <span
              className="flex items-center justify-center w-7 h-7 rounded-lg shrink-0 shadow-xs"
              style={{
                background: "color-mix(in oklch, var(--text-prefill-accent) 18%, transparent)",
                color: "var(--text-prefill-accent)",
              }}
            >
              <Sparkles size={15} className="animate-pulse" />
            </span>
            <div>
              <h3 className="text-xs font-bold font-mono uppercase tracking-wider" style={{ color: "var(--text-prefill-accent)" }}>
                AI Smart Pre-fill
              </h3>
              <p className="text-[11px] leading-tight opacity-80" style={{ color: "var(--text-muted)" }}>
                Enter the client&apos;s website domain to automatically scan, extract, and populate their offer details.
              </p>
            </div>
          </div>

          {hasPrefillNotes && !prefillLoading && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0">
              <CheckCircle2 size={12} />
              <span>Extracted & Populated</span>
            </div>
          )}
        </div>

        {/* Domain Input & Action Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="relative flex-1">
            <Globe size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
            <input
              type="text"
              value={prefillDomain}
              onChange={(e) => setPrefillDomain(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  runSmartPrefill();
                }
              }}
              placeholder="e.g. clientdomain.com"
              disabled={prefillLoading}
              className="w-full rounded-xl pl-9 pr-3 py-2 text-xs font-mono transition-all focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-60 shadow-xs"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border-prefill)",
                color: "var(--text-primary)",
              }}
            />
          </div>

          <button
            type="button"
            onClick={runSmartPrefill}
            disabled={prefillLoading || !prefillDomain.trim()}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold font-mono uppercase tracking-wider rounded-xl transition-all cursor-pointer text-white disabled:opacity-50 disabled:cursor-not-allowed shadow-xs active:translate-y-px shrink-0"
            style={{ background: "var(--text-prefill-accent)" }}
          >
            {prefillLoading ? (
              <>
                <PrefillLoader size={14} />
                <span>Scanning domain...</span>
              </>
            ) : (
              <>
                <Wand2 size={13} />
                <span>Auto-Fill Offer</span>
              </>
            )}
          </button>
        </div>

        {/* Pre-fill Notes / Status Output */}
        {prefillError && (
          <p className="text-[11px] font-mono mt-2.5 font-medium" style={{ color: "var(--error)" }}>
            Error: {prefillError}
          </p>
        )}

        {hasPrefillNotes && (
          <div className="mt-3 pt-2.5 border-t border-dashed" style={{ borderColor: "var(--border-prefill)" }}>
            <p className="text-[10px] font-mono uppercase tracking-wider font-semibold mb-1" style={{ color: "var(--text-muted)" }}>
              Detected Signals:
            </p>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px]">
              {prefillNotes.map((note, idx) => (
                <li key={idx} className="flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
                  <span className="w-1 h-1 rounded-full bg-indigo-500 shrink-0" />
                  <span className="truncate">{note}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* --- SECTION 1: CLIENT & OFFER DETAILS --- */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 border-b pb-1.5" style={{ borderColor: "var(--border)" }}>
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
            Step 1.1
          </span>
          <h2 className="text-xs font-bold uppercase tracking-wider font-mono" style={{ color: "var(--text-primary)" }}>
            Client & Offer Details
          </h2>
        </div>

        <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
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
            label="Industry / Vertical"
            value={form.offerVertical}
            onChange={(v) => set("offerVertical", v)}
            placeholder="e.g. coaching, agency, SaaS, consulting"
            helpText="Powers Funnel Audit benchmark comparisons against similar offers."
          />
        </div>
      </div>

      {/* --- SECTION 2: MARKET & POSITIONING --- */}
      <div className="space-y-4 pt-2">
        <div className="flex items-center gap-2 border-b pb-1.5" style={{ borderColor: "var(--border)" }}>
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
            Step 1.2
          </span>
          <h2 className="text-xs font-bold uppercase tracking-wider font-mono" style={{ color: "var(--text-primary)" }}>
            Market & Positioning
          </h2>
        </div>

        <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
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

          <InputField
            label="Who runs the calls?"
            value={form.prospectMeets}
            onChange={(v) => set("prospectMeets", v)}
            placeholder="e.g. Lead Strategist"
            helpText="The role or title of whoever takes these calls (e.g. closer, founder, account lead)."
          />

          <div className="md:col-span-2">
            <InputField
              label="Who is the ideal customer? (ICP)"
              value={form.offerIcp}
              onChange={(v) => set("offerIcp", v)}
              placeholder="e.g. B2B founders doing $1M-$10M in revenue"
              helpText="A short description used to personalize follow-ups and call briefs."
              required
            />
          </div>

          <div className="md:col-span-2 flex items-start space-x-3 p-3.5 rounded-xl border bg-background/50 select-none" style={{ borderColor: "var(--border)" }}>
            <input
              type="checkbox"
              id="hybrid"
              checked={form.hybridMode}
              onChange={(e) => set("hybridMode", e.target.checked)}
              className="w-4 h-4 rounded cursor-pointer mt-0.5"
              style={{ accentColor: "var(--accent)" }}
            />
            <label htmlFor="hybrid" className="text-xs cursor-pointer leading-normal space-y-0.5">
              <span className="font-semibold block" style={{ color: "var(--text-primary)" }}>
                AI First-Touch Personalization
              </span>
              <span className="text-[11px] block" style={{ color: "var(--text-muted)" }}>
                Automatically personalize each booking confirmation email and message based on the prospect&apos;s background.
              </span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}