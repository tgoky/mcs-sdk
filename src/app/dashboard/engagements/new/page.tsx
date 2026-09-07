"use client";

// src/app/dashboard/engagements/new/page.tsx
//
// Phase 6 — replaces the old multi-step wizard (offer/stack/credentials/
// confirm/launch) with the same minimal, name-only creation Teammates
// chat's create_client tool already uses. Real setup — Pin-Down, Identity
// Setup, or both — happens on the client's own Library/Workers page
// afterward, exactly like it already does for a chat-created client; this
// page no longer front-loads any of it. See create-minimal-engagement.ts
// and worker-registry.ts's own Phase 5 work (every worker's real config
// fields are now individually reachable from there, either through a
// worker's own setup page or the dual-mode enable flow) for why deferring
// this is safe rather than a regression.
//
// The old wizard's step components/helpers (steps/, credential-field.tsx,
// draft-storage.ts, use-draft-persistence.ts, use-email-integrations.ts,
// use-smart-prefill.ts, validation.ts, constants.ts, submit-payload.ts,
// types.ts) are left in place, unrouted, rather than deleted in this same
// pass — form-fields.tsx specifically is still a real, load-bearing
// dependency (identity-graph-form.tsx imports InputField/TextAreaView
// from it), and the rest weren't exhaustively traced for zero remaining
// references before this page stopped routing to them. Dead code, not
// verified-safe-to-delete code — a distinct, smaller follow-up.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { InputField } from "./form-fields";

export default function NewEngagementPage() {
  const router = useRouter();
  const [buyerName, setBuyerName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const trimmed = buyerName.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/engagements/minimal-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buyerName: trimmed }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Could not create client.");
      router.push(`/dashboard/engagements/${body.engagementId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create client.");
      setSubmitting(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-[70vh] px-4 font-sans antialiased">
      <div className="w-full max-w-md space-y-5">
        <div className="space-y-1.5 text-center">
          <h1 className="text-xl font-bold text-zinc-900 dark:text-white tracking-tight">Create a client</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
            Just a name for now — you&apos;ll pick which workers to set up (Pin-Down, Identity Setup, or both) on their own page right after.
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-5 space-y-4 shadow-sm">
          <InputField
            label="Client name"
            required
            value={buyerName}
            onChange={setBuyerName}
            placeholder="Acme Roofing Co."
            helpText="The person or business you're running this for."
          />

          {error && (
            <div className="rounded-xl border border-rose-300 dark:border-rose-800/50 bg-rose-100 dark:bg-rose-950/20 px-3 py-2 text-xs text-rose-800 dark:text-rose-300">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={submit}
            disabled={submitting || !buyerName.trim()}
            className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-zinc-900 dark:bg-white px-4 py-2.5 text-sm font-bold text-white dark:text-zinc-900 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity cursor-pointer"
          >
            {submitting ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />}
            Create client
          </button>
        </div>
      </div>
    </div>
  );
}
