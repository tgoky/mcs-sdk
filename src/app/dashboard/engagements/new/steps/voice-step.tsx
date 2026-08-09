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
              className="w-full rounded-lg px-3 py-2 text-xs resize-y transition-colors shadow-xs placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
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
      className="w-full rounded-lg px-3 py-2 text-xs resize-y transition-colors shadow-xs placeholder:text-zinc-400 dark:placeholder:text-zinc-600"         
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
              Social proof for whichever skills and agents use it — e.g. Pin-Down&apos;s confirmation page, Pile-On&apos;s ad briefs.
            </p>
          </div>
          <button
            type="button"
            onClick={addTestimonial}
         className="px-3 py-1.5 text-xs font-bold font-mono uppercase tracking-wider rounded-lg transition-all cursor-pointer border bg-background/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 shrink-0 shadow-xs"
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
          className="w-full rounded-lg px-3 py-2 text-xs resize-y transition-colors placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
                style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
