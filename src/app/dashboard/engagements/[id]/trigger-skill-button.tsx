"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * FIXED: Previously this component expected an `endpoint` prop, but the parent
 * page was passing `engagementId` + `skillName` — so every "Run X" button was
 * calling `fetch(undefined)` and silently failing. Now uses the unified
 * /api/skill-runs/trigger route and redirects to the run detail page on success.
 */
export function TriggerSkillButton({
  engagementId,
  skillName,
  label,
}: {
  engagementId: string;
  skillName: string;
  label: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);

  async function trigger() {
    setState("running");
    setMessage(null);
    setRunId(null);
    try {
      const res = await fetch("/api/skill-runs/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ engagementId, skillName }),
      });
      const data = await res.json();

      if (res.ok) {
        setState("done");
        setMessage(data.message ?? "Completed");
        if (data.runId) {
          setRunId(data.runId);
        }
        // Refresh the page so the Run History section updates
        router.refresh();
      } else {
        setState("error");
        setMessage(data.error ?? "Unknown error");
      }
    } catch (e: any) {
      setState("error");
      setMessage(e.message);
    }
  }

  return (
    <div className="space-y-1">
      <button
        onClick={trigger}
        disabled={state === "running"}
        className="w-full text-left px-3 py-2 text-[10px] font-mono font-medium rounded border border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
      >
        {state === "running" ? "RUNNING…" : label.toUpperCase()}
      </button>

      {message && (
        <p
          className={`text-[10px] font-mono px-1 ${
            state === "error" ? "text-rose-400" : "text-emerald-400"
          }`}
        >
          {message}
          {runId && (
            <a
              href={`/dashboard/runs/${runId}`}
              className="ml-2 underline underline-offset-2 text-zinc-400 hover:text-zinc-200"
            >
              View run →
            </a>
          )}
        </p>
      )}
    </div>
  );
}