"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IdentityGraphForm,
  EMPTY_IDENTITY_GRAPH_FORM,
  fromSavedGraph,
  toIntakePayload,
  type IdentityGraphFormState,
} from "@/features/reputation-manager/identity-graph-form";
import type { RepCollision } from "@/models/schema";

/**
 * Reputation Manager's hinges panel for a client that already exists —
 * reached from that client's Products panel "Set up" card. Mirrors
 * bridges/pin-down/page.tsx's own shape: GET pre-fills whatever's
 * already saved, POST saves + enables the skill + dispatches the
 * collision-check run.
 */
export default function RepOnboardingBridgePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [buyer, setBuyer] = useState("");
  const [form, setForm] = useState<IdentityGraphFormState>(EMPTY_IDENTITY_GRAPH_FORM);
  const [foundCollisions, setFoundCollisions] = useState<(RepCollision & { source: "collision_check" })[]>([]);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/engagements/${id}/bridges/rep-onboarding`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load");
        if (cancelled) return;

        setBuyer(data.buyer ?? "");
        if (data.graph) {
          setForm(fromSavedGraph(data.graph));
          setFoundCollisions(
            (data.graph.collisions ?? []).filter((c: RepCollision & { source: string }) => c.source === "collision_check")
          );
        } else if (data.buyer) {
          // Nothing saved yet — a reasonable start beats a blank field.
          setForm((f) => ({ ...f, operatorName: data.buyer }));
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
  }, [id]);

  async function handleSubmit() {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/engagements/${id}/bridges/rep-onboarding`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toIntakePayload(form)),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setSaved(true);
      router.refresh();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="max-w-2xl mx-auto py-16 px-4 text-sm text-zinc-500 dark:text-zinc-400">Loading…</div>;
  }
  if (loadError) {
    return <div className="max-w-2xl mx-auto py-16 px-4 text-sm text-red-600 dark:text-red-400">{loadError}</div>;
  }

  return (
    <div className="max-w-2xl mx-auto py-12 px-4">
      <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-1">Reputation Manager — Identity Setup</h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-8">for {buyer}</p>

      <IdentityGraphForm form={form} onChange={setForm} readOnlyCollisions={foundCollisions} />

      {saveError && <p className="text-xs text-red-600 dark:text-red-400 mt-4">{saveError}</p>}
      {saved && <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-4">Saved.</p>}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={saving || !form.operatorName.trim() || !form.soleAuthorityName.trim()}
        className="mt-6 px-4 py-2.5 text-sm font-bold rounded-lg transition-all cursor-pointer border bg-zinc-900 text-zinc-50 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {saving ? "Saving…" : "Save & enable"}
      </button>
    </div>
  );
}
