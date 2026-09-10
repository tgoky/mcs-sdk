"use client";

// Voice Capture's hinges form. Simplification (honest v1 scope): body
// variant pools are edited as one shared "default" pool of exactly 2
// touchsets (the minimum body-variants.ts enforces before Daily Send will
// run in upload mode) rather than a full per-ICP pool editor — resolvePool
// already falls back to "default" for any ICP with no ICP-specific pool,
// so this is a real, working configuration, just not per-ICP-tuned yet.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { InputField, TextAreaField } from "@/app/dashboard/engagements/new/form-fields";

type Touchset = { subject: string; body1: string; body2: string; body3: string };
function emptyTouchset(): Touchset {
  return { subject: "", body1: "", body2: "", body3: "" };
}

export function VoiceCaptureConfigForm({ engagementId, onCancel, cancelLabel = "Close" }: { engagementId: string; onCancel: () => void; cancelLabel?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [buyer, setBuyer] = useState("");

  const [greeting, setGreeting] = useState("Hi");
  const [signOff, setSignOff] = useState("Best");
  const [tone, setTone] = useState("");
  const [subjectVariants, setSubjectVariants] = useState("");
  const [touchsets, setTouchsets] = useState<Touchset[]>([emptyTouchset(), emptyTouchset()]);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/engagements/${engagementId}/bridges/voice-capture`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load");
        if (cancelled) return;
        setBuyer(data.buyer ?? "");
        if (data.voiceProfile) {
          setGreeting(data.voiceProfile.greeting ?? "Hi");
          setSignOff(data.voiceProfile.signOff ?? "Best");
          setTone(data.voiceProfile.tone ?? "");
        }
        setSubjectVariants((data.subjectVariants ?? []).join("\n"));
        const defaultPool = data.bodyVariantPools?.default;
        if (Array.isArray(defaultPool) && defaultPool.length > 0) {
          setTouchsets(defaultPool.length >= 2 ? defaultPool : [...defaultPool, emptyTouchset()]);
        }
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [engagementId]);

  function updateTouchset(i: number, patch: Partial<Touchset>) {
    setTouchsets((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  const canSubmit = greeting.trim() && signOff.trim() && tone.trim();

  async function handleSubmit() {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/bridges/voice-capture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          greeting: greeting.trim(),
          signOff: signOff.trim(),
          tone: tone.trim(),
          subjectVariants: subjectVariants.split("\n").map((s) => s.trim()).filter(Boolean),
          bodyVariantPools: { default: touchsets.filter((t) => t.body1.trim()) },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setWarnings(data.warnings ?? []);
      setSaved(true);
      router.refresh();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-6 text-xs font-mono text-zinc-500 dark:text-zinc-400">Loading…</div>;
  if (loadError) return <div className="p-6 text-xs font-mono font-semibold text-rose-600 dark:text-rose-400">⚠ {loadError}</div>;

  return (
    <div className="max-w-3xl mx-auto py-6 px-4 space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Voice Capture{buyer ? ` — ${buyer}` : ""}</h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Greeting, sign-off, tone, and the rotated subject/body pools Daily Send writes with.</p>
        </div>
        <button type="button" onClick={onCancel} className="shrink-0 text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 cursor-pointer">
          {cancelLabel}
        </button>
      </div>

      <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
        <InputField label="Greeting" value={greeting} onChange={setGreeting} placeholder="Hi" required />
        <InputField label="Sign-off" value={signOff} onChange={setSignOff} placeholder="Best" required />
        <InputField label="Tone" value={tone} onChange={setTone} placeholder="direct, plain-spoken" required />
      </div>

      <TextAreaField
        label="Subject line pool (one per line, 3-4+ recommended)"
        value={subjectVariants}
        onChange={setSubjectVariants}
        placeholder={"chatgpt on {company_name}\n{company_name}'s show rate\nquick read on {company_name}"}
        rows={4}
        helpText="No em/en dashes, exclamation points, emoji, or {first_name} — these get rejected on save."
      />

      <div className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Body variants (at least 2, rotated per lead)</h2>
        {touchsets.map((t, i) => (
          <div key={i} className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3 space-y-2">
            <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">Variant {i + 1}</p>
            <InputField label="Subject (optional override)" value={t.subject} onChange={(v) => updateTouchset(i, { subject: v })} />
            <TextAreaField label="Touch 1" value={t.body1} onChange={(v) => updateTouchset(i, { body1: v })} rows={3} />
            <TextAreaField label="Touch 2" value={t.body2} onChange={(v) => updateTouchset(i, { body2: v })} rows={3} />
            <TextAreaField label="Touch 3" value={t.body3} onChange={(v) => updateTouchset(i, { body3: v })} rows={3} />
          </div>
        ))}
      </div>

      {saveError && <p className="text-xs font-mono font-semibold text-rose-600 dark:text-rose-400">⚠ {saveError}</p>}
      {warnings.length > 0 && (
        <div className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-lg px-3 py-2 space-y-1">
          {warnings.map((w, i) => (
            <p key={i}>⚠ {w}</p>
          ))}
        </div>
      )}
      {saved && !saveError && <p className="text-xs font-mono font-semibold text-emerald-600 dark:text-emerald-400">✓ Saved.</p>}

      <div className="flex justify-between pt-2 border-t border-zinc-200 dark:border-zinc-800">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-xs font-bold rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 cursor-pointer">
          {cancelLabel}
        </button>
        <button type="button" onClick={handleSubmit} disabled={saving || !canSubmit} className="px-5 py-2 text-xs font-bold rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-50 dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
