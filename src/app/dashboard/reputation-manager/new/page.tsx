"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  IdentityGraphForm,
  EMPTY_IDENTITY_GRAPH_FORM,
  toIntakePayload,
  type IdentityGraphFormState,
} from "@/features/reputation-manager/identity-graph-form";

/**
 * Reputation Manager's own front door for a brand-new client — no
 * quick-add pre-step, no existing engagement id. Submitting this form
 * creates the client and its identity graph in one motion, same "each
 * product is fully self-sufficient" shape Showtime's own wizard has
 * always had.
 */
export default function ReputationManagerNewPage() {
  const router = useRouter();
  const [form, setForm] = useState<IdentityGraphFormState>(EMPTY_IDENTITY_GRAPH_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleSubmit() {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/reputation-manager/new", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toIntakePayload(form)),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create client");
      router.push(`/dashboard/reputation-manager`);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to create client");
      setSaving(false);
    }
  }

  return (
    <div className="relative min-h-screen w-full text-zinc-600 dark:text-zinc-400 font-sans tracking-tight antialiased select-none px-1 transition-colors duration-200 overflow-hidden pb-10">
      <div className="pointer-events-none absolute inset-0 z-0 bg-dot-grid" aria-hidden="true" />

      <div className="relative z-10 space-y-6 w-full max-w-3xl">
        <div className="pb-3 border-b border-zinc-200/80 dark:border-zinc-800/80">
          <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">New Reputation Manager client</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
            Already have this client set up somewhere else? Add Reputation Manager from their own page instead — this is for starting fresh.
          </p>
        </div>

        <IdentityGraphForm form={form} onChange={setForm} />

        {saveError && <p className="text-xs text-red-600 dark:text-red-400">{saveError}</p>}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving || !form.operatorName.trim() || !form.soleAuthorityName.trim()}
          className="px-4 py-2.5 text-sm font-bold rounded-lg transition-all cursor-pointer border bg-zinc-900 text-zinc-50 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? "Creating…" : "Create client"}
        </button>
      </div>
    </div>
  );
}
