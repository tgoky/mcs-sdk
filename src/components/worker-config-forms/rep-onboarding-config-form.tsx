"use client";

// Extracted from this directory's page.tsx — see leak-map-config-form.tsx's
// header for why (inline Configure on WorkersPanel/Library vs. this same
// form as its own standalone, bookmarkable route).
//
// The original page had no cancel/back action at all (only "Save &
// enable") — reasonable when this was the only thing on the page, not
// reasonable once it can render inline next to other worker cards with
// no way to collapse back to them. Added a plain "Cancel" text action.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IdentityGraphForm,
  EMPTY_IDENTITY_GRAPH_FORM,
  fromSavedGraph,
  toIntakePayload,
  type IdentityGraphFormState,
} from "@/features/reputation-manager/identity-graph-form";
import type { RepCollision } from "@/models/schema";

export function RepOnboardingConfigForm({ engagementId, onCancel }: { engagementId: string; onCancel: () => void }) {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [buyer, setBuyer] = useState("");
  const [wasDisabled, setWasDisabled] = useState(false);
  const [form, setForm] = useState<IdentityGraphFormState>(EMPTY_IDENTITY_GRAPH_FORM);
  const [foundCollisions, setFoundCollisions] = useState<(RepCollision & { source: "collision_check" })[]>([]);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/engagements/${engagementId}/bridges/rep-onboarding`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load");
        if (cancelled) return;

        setBuyer(data.buyer ?? "");
        setWasDisabled(data.enabled === false);
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
  }, [engagementId]);

  async function handleSubmit() {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/bridges/rep-onboarding`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toIntakePayload(form)),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setSaved(true);
      setWasDisabled(false);
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
      <div className="flex items-start justify-between gap-3 mb-1">
        <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Reputation Manager — Identity Setup</h1>
        <button
          type="button"
          onClick={onCancel}
          className="shrink-0 text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors cursor-pointer"
        >
          Cancel
        </button>
      </div>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-1">for {buyer}</p>

      {wasDisabled && (
        <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-lg px-3 py-2 mt-4 mb-4">
          Identity Setup is currently turned off for this client — every other Reputation Manager skill reads from this
          graph, so it can only be turned back on by saving it here. Saving below will turn it back on.
        </p>
      )}

      <div className={wasDisabled ? "" : "mt-8"}>
        <IdentityGraphForm form={form} onChange={setForm} readOnlyCollisions={foundCollisions} />
      </div>

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
