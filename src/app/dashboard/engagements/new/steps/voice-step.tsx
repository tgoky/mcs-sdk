import { InputField } from "../form-fields";
import type { FormData, Testimonial } from "../types";

export function VoiceStep({
  form,
  set,
  addTestimonial,
  updateTestimonial,
  removeTestimonial,
}: {
  form: FormData;
  set: (field: keyof FormData, value: string | boolean) => void;
  addTestimonial: () => void;
  updateTestimonial: (index: number, field: keyof Testimonial, value: string) => void;
  removeTestimonial: (index: number) => void;
}) {
  return (
    <div className="space-y-6 w-full">
      <div className="space-y-2">
        <label className="text-xs font-semibold block" style={{ color: "var(--text-primary)" }}>
          How should we learn this client&apos;s voice?
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => set("voiceSource", "scrape")}
            className={`flex-1 text-left px-4 py-3 rounded-lg text-xs transition-all cursor-pointer shadow-xs border ${
              form.voiceSource === "scrape"
                ? "bg-zinc-100 border-zinc-900 text-zinc-900 dark:bg-zinc-800 dark:border-zinc-100 dark:text-zinc-100 font-semibold"
                : "bg-white border-zinc-200 text-zinc-600 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-700"
            }`}
          >
            <span className="font-bold uppercase tracking-wider font-mono block">
              Scrape their website
            </span>
            <p className={`mt-1 leading-relaxed font-normal ${
              form.voiceSource === "scrape"
                ? "text-zinc-700 dark:text-zinc-300"
                : "text-zinc-500 dark:text-zinc-400"
            }`}>
              We crawl their site (and recent broadcast emails, if Klaviyo is connected) automatically. Pasting a sample below too still helps if the crawl comes up short.
            </p>
          </button>

          <button
            type="button"
            onClick={() => set("voiceSource", "manual")}
            className={`flex-1 text-left px-4 py-3 rounded-lg text-xs transition-all cursor-pointer shadow-xs border ${
              form.voiceSource === "manual"
                ? "bg-zinc-100 border-zinc-900 text-zinc-900 dark:bg-zinc-800 dark:border-zinc-100 dark:text-zinc-100 font-semibold"
                : "bg-white border-zinc-200 text-zinc-600 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-700"
            }`}
          >
            <span className="font-bold uppercase tracking-wider font-mono block">
              Paste a writing sample
            </span>
            <p className={`mt-1 leading-relaxed font-normal ${
              form.voiceSource === "manual"
                ? "text-zinc-700 dark:text-zinc-300"
                : "text-zinc-500 dark:text-zinc-400"
            }`}>
              Sales copy, call transcripts, or email examples — ready to use right now.
            </p>
          </button>
        </div>
      </div>

      {form.voiceSource === "scrape" && (
        <InputField
          label="Marketing website"
          value={form.marketingDomain}
          onChange={(v) => set("marketingDomain", v)}
          placeholder="yoursite.com"
          helpText="We'll crawl this site (and pricing/sales pages if we find them) during setup to build the voice profile."
        />
      )}

      <InputField
        label="Existing confirmation page (if any)"
        value={form.existingConfirmationPageUrl}
        onChange={(v) => set("existingConfirmationPageUrl", v)}
        placeholder="https://yoursite.com/thank-you"
        helpText="If your client already has a post-booking confirmation page live, paste its URL — we'll audit it against the new one and show you what's worth carrying over."
      />

      <div className="space-y-1.5 w-full">
        <label className="text-xs font-semibold block" style={{ color: "var(--text-primary)" }}>
          Sales copy, scripts, or call transcripts (500 words minimum)
        </label>
        <textarea
          value={form.rawVoiceCorpus}
          onChange={(e) => set("rawVoiceCorpus", e.target.value)}
          placeholder="Paste sales call transcripts, email copy, or scripts here..."
          rows={8}
          className="w-full rounded-md px-3 py-2 text-xs resize-y focus:outline-none transition-colors shadow-xs placeholder:text-zinc-400 dark:placeholder:text-zinc-600 font-medium"
          style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
        />
        <p className="text-[11px] font-mono font-bold" style={{ color: "var(--text-muted)" }}>
          {form.rawVoiceCorpus.trim().split(/\s+/).filter(Boolean).length} words pasted.{" "}
          {form.rawVoiceCorpus.trim().split(/\s+/).filter(Boolean).length < 500
            ? "Add more — at least 500 words are needed to learn the brand voice accurately."
            : "✓ That's enough to learn the brand voice."}
        </p>
      </div>

      <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
        <div className="space-y-1.5 w-full">
          <label className="text-xs font-semibold block" style={{ color: "var(--text-primary)" }}>
            Most common questions on calls (one per line)
          </label>
          <textarea
            value={form.topCallQuestions}
            onChange={(e) => set("topCallQuestions", e.target.value)}
            placeholder={"How long does onboarding take?\nWhat results can I expect?"}
            rows={4}
            className="w-full rounded-md px-3 py-2 text-xs resize-y focus:outline-none transition-colors shadow-xs placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
            style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
          />
        </div>

        <div className="space-y-1.5 w-full">
          <label className="text-xs font-semibold block" style={{ color: "var(--text-primary)" }}>
            Most common objections (one per line)
          </label>
          <textarea
            value={form.topObjections}
            onChange={(e) => set("topObjections", e.target.value)}
            placeholder={"It's too expensive for our budget right now.\nThe timing doesn't work for us right now."}
            rows={4}
            className="w-full rounded-md px-3 py-2 text-xs resize-y focus:outline-none transition-colors shadow-xs placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
            style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
          />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <label className="text-xs font-semibold block" style={{ color: "var(--text-primary)" }}>
              Testimonials (optional)
            </label>
            <p className="text-[11px] mt-0.5 opacity-85" style={{ color: "var(--text-muted)" }}>
              Shown on the confirmation page as social proof. Skip this and the page ships without that section.
            </p>
          </div>
          <button
            type="button"
            onClick={addTestimonial}
            className="px-3 py-1.5 text-xs font-bold font-mono uppercase tracking-wider rounded-md transition-all cursor-pointer border bg-background/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 shrink-0 shadow-xs"
            style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
          >
            + Add testimonial
          </button>
        </div>

        {form.testimonials.map((t, i) => (
          <div key={i} className="grid gap-3 grid-cols-1 md:grid-cols-2 rounded-lg p-3 shadow-xs" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <InputField
              label="Name"
              value={t.name}
              onChange={(v) => updateTestimonial(i, "name", v)}
              placeholder="e.g. Jamie Chen"
            />
            <InputField
              label="Role"
              value={t.role}
              onChange={(v) => updateTestimonial(i, "role", v)}
              placeholder="e.g. Head of Growth"
            />
            <InputField
              label="Company (optional)"
              value={t.company}
              onChange={(v) => updateTestimonial(i, "company", v)}
              placeholder="e.g. Acme Corp"
            />
            <div className="flex items-end font-mono">
              <button
                type="button"
                onClick={() => removeTestimonial(i)}
                className="px-3 py-1.5 text-xs font-bold rounded-md hover:opacity-80 transition-colors cursor-pointer"
                style={{ color: "var(--error)" }}
              >
                [ Remove ]
              </button>
            </div>
            <div className="md:col-span-2 space-y-1.5">
              <label className="text-xs font-semibold block" style={{ color: "var(--text-primary)" }}>Quote</label>
              <textarea
                value={t.quote}
                onChange={(e) => updateTestimonial(i, "quote", e.target.value)}
                placeholder="What they said about working with this client..."
                rows={2}
                className="w-full rounded-md px-3 py-2 text-xs resize-y focus:outline-none transition-colors placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
                style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
