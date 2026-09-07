"use client";

// src/app/dashboard/engagements/[id]/run-pin-down-piece-button.tsx
//
// One input + trigger button, same state machine as trigger-skill-button.tsx
// (idle/running/done/error, link to the run page on success) — that
// component has no input field, and brand voice extraction / page audit
// both need exactly one (a domain, a page URL) before they can dispatch.
// Posts to /api/engagements/[id]/pin-down/run-piece, which calls the same
// trigger functions Teammates chat already uses for these two pieces.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ArrowRight } from "lucide-react";

export function RunPinDownPieceButton({
  engagementId,
  piece,
  inputLabel,
  inputPlaceholder,
  defaultValue = "",
  buttonLabel,
}: {
  engagementId: string;
  piece: "voice" | "page_audit";
  inputLabel: string;
  inputPlaceholder: string;
  defaultValue?: string;
  buttonLabel: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue);
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);

  async function trigger() {
    const trimmed = value.trim();
    if (!trimmed) return;
    setState("running");
    setMessage(null);
    setRunId(null);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/pin-down/run-piece`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(piece === "voice" ? { piece, domain: trimmed } : { piece, pageUrl: trimmed }),
      });
      const data = await res.json();
      if (res.ok) {
        setState("done");
        setMessage(data.message ?? "Running — check back shortly.");
        if (data.runId) setRunId(data.runId);
        router.refresh();
      } else {
        setState("error");
        setMessage(data.error ?? "Failed to start.");
      }
    } catch (e) {
      setState("error");
      setMessage(e instanceof Error ? e.message : "Failed to start.");
    }
  }

  return (
    <div className="space-y-2 w-full">
      <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-bold block">{inputLabel}</label>
      <div className="flex items-center gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={inputPlaceholder}
          disabled={state === "running"}
          className="flex-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-900 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:border-zinc-400 dark:focus:border-zinc-700 focus:outline-none"
        />
        <button
          type="button"
          onClick={trigger}
          disabled={state === "running" || !value.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-zinc-900 dark:bg-white px-3 py-1.5 text-xs font-semibold text-white dark:text-zinc-900 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0"
        >
          {state === "running" ? <Loader2 size={13} className="animate-spin" /> : <ArrowRight size={13} />}
          {buttonLabel}
        </button>
      </div>

      {message && (
        <p
          className={`text-[11px] font-mono font-semibold px-1 py-0.5 rounded-sm flex items-center justify-between ${
            state === "error" ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"
          }`}
        >
          <span>{message}</span>
          {runId && (
            <a
              href={`/dashboard/runs/${runId}`}
              className="underline underline-offset-2 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 font-bold ml-auto transition-colors"
            >
              View run →
            </a>
          )}
        </p>
      )}
    </div>
  );
}
