"use client";

// src/components/library/enable-worker-modal.tsx
//
// Phase 5's "lighter form, grouped rows, not a long form" fallback for
// enabling a worker without chat — now genuinely paired with chat, not
// instead of it. Two tabs, not one path forced on the user:
//
//   - "Quick setup": horizontal label+control rows (not a stacked form)
//     for the fields safely persistable through the existing, narrowly-
//     scoped PATCH /api/engagements/[id] route.
//   - "Ask Teammates": the actual Teammates chat, embedded inline via
//     TeammatesChat's own size="compact" mode — not a redirect to
//     /dashboard/teammates. Pre-seeded with a message naming this client
//     so the user never has to explain who or what; the assistant calls
//     the exact same enable_pile_on tool (chat-skill wiring in
//     teammates/chat/route.ts) that ultimately calls the same
//     enablePileOnForEngagement function Quick-setup's own submit does —
//     one shared function behind both tabs, so they can't diverge.
//
// Whichever tab the user actually finishes through is remembered
// (browser-local — this is a per-viewer UX nicety, not data worth a
// schema migration) and opens by default next time, on ANY worker's
// modal, not just this one — same idea skill-driven apps use for
// "always open my last view."
//
// Scoped to pile-on specifically for the same reason its predecessor
// was — see this file's own prior header, now folded into this one: it's
// the one worker with real ask-kind fields and no hinges panel to answer
// them in. Generalizing the tab mechanism itself to other workers is
// straightforward once a second one needs it; only the Quick-setup tab's
// field list is pile-on-specific today.

import { useState } from "react";
import { Loader2, ArrowRight, Settings2, MessageCircle } from "lucide-react";
import { Modal } from "@/components/modal";
import { SMS_PLATFORM_LABELS, AD_DATA_PLATFORM_LABELS } from "@/lib/copy";
import { TeammatesChat } from "@/app/dashboard/teammates/teammates-chat";
import { Dropdown } from "@/components/ui/dropdown";

const SMS_OPTIONS = ["none", "twilio", "ghl_sms", "hubspot_sms"];
const AD_DATA_OPTIONS = ["none", "hyros", "google_sheets", "native_crm"];

const SMS_DROPDOWN_ITEMS = SMS_OPTIONS.map((v) => ({ key: v, label: SMS_PLATFORM_LABELS[v] }));
const AD_DATA_DROPDOWN_ITEMS = AD_DATA_OPTIONS.map((v) => ({ key: v, label: AD_DATA_PLATFORM_LABELS[v] }));

// Matches this modal's own field styling (bg-white/bg-zinc-950,
// border-zinc-200/border-zinc-800) rather than Dropdown's default, which
// is hardcoded dark-only (border-zinc-800 bg-zinc-900/80) and would look
// wrong sitting inside this modal's light-mode surface.
const DROPDOWN_FIELD_CLASSES =
  "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-900";

const MODE_STORAGE_KEY = "mcs-enable-worker-mode";

function readStoredMode(): "form" | "chat" {
  if (typeof window === "undefined") return "form";
  try {
    return window.localStorage.getItem(MODE_STORAGE_KEY) === "chat" ? "chat" : "form";
  } catch {
    return "form";
  }
}

function writeStoredMode(mode: "form" | "chat") {
  try {
    window.localStorage.setItem(MODE_STORAGE_KEY, mode);
  } catch {
    // best-effort
  }
}

export function EnablePileOnModal({
  engagementId,
  buyerName,
  onClose,
  onEnabled,
}: {
  engagementId: string;
  buyerName?: string;
  onClose: () => void;
  onEnabled: () => void;
}) {
  // Lazy initializer, not an effect + setState — safe here because this
  // component only ever mounts client-side, after a click flips
  // showEnableModal true in WorkerCard (never during SSR), so there's no
  // hydration value to match against.
  const [mode, setMode] = useState<"form" | "chat">(() => readStoredMode());
  const [smsPlatform, setSmsPlatform] = useState("none");
  const [adDataPlatform, setAdDataPlatform] = useState("none");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function selectMode(next: "form" | "chat") {
    setMode(next);
    writeStoredMode(next);
  }

  async function submitForm(skip: boolean) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/workers/pile-on/enable-with-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(skip ? {} : { smsPlatform, adDataPlatform }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "Could not enable Pile-On.");
      writeStoredMode("form");
      onEnabled();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal title="Enable Pile-On" onClose={onClose} maxWidthClass="max-w-xl">
      <div className="space-y-4 font-sans">
        <div className="flex items-center gap-1 rounded-xl bg-zinc-200/60 dark:bg-zinc-900 p-1 border border-zinc-200 dark:border-zinc-800 text-xs w-fit">
          <button
            type="button"
            onClick={() => selectMode("form")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
              mode === "form" ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
            }`}
          >
            <Settings2 size={13} /> Quick setup
          </button>
          <button
            type="button"
            onClick={() => selectMode("chat")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
              mode === "chat" ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
            }`}
          >
            <MessageCircle size={13} /> Ask Teammates
          </button>
        </div>

        {mode === "form" ? (
          <div className="space-y-4">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Two quick choices, both optional — skip either and it defaults to off. Finer setup (SMS compliance registration, ad-cohort account
              details) continues from Edit Stack Settings after enabling.
            </p>

            <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2">
              <label className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">SMS follow-ups</label>
              <Dropdown
                items={SMS_DROPDOWN_ITEMS}
                selectedKey={smsPlatform}
                onSelect={setSmsPlatform}
                align="right"
                triggerClassName={DROPDOWN_FIELD_CLASSES}
              />
            </div>

            <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2">
              <label className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">Ad-data cohort sync</label>
              <Dropdown
                items={AD_DATA_DROPDOWN_ITEMS}
                selectedKey={adDataPlatform}
                onSelect={setAdDataPlatform}
                align="right"
                triggerClassName={DROPDOWN_FIELD_CLASSES}
              />
            </div>

            {error && (
              <div className="rounded-xl border border-rose-300 dark:border-rose-800/50 bg-rose-100 dark:bg-rose-950/20 px-3 py-2 text-xs text-rose-800 dark:text-rose-300">
                {error}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => submitForm(true)}
                disabled={pending}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white cursor-pointer disabled:opacity-40"
              >
                Skip for now
              </button>
              <button
                type="button"
                onClick={() => submitForm(false)}
                disabled={pending}
                className="flex items-center gap-1.5 rounded-lg bg-zinc-900 dark:bg-white px-3.5 py-1.5 text-xs font-semibold text-white dark:text-zinc-900 hover:opacity-90 disabled:opacity-40 cursor-pointer"
              >
                {pending ? <Loader2 size={13} className="animate-spin" /> : <ArrowRight size={13} />}
                Enable Pile-On
              </button>
            </div>
          </div>
        ) : (
          <div className="h-[420px] rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            <TeammatesChat
              size="compact"
              initialThreadId={null}
              initialPendingMessage={`Enable Pile-On for ${buyerName ?? "this client"} (engagementId: ${engagementId})`}
              onThreadEvent={() => {
                writeStoredMode("chat");
              }}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
