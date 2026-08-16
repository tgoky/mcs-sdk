"use client";

// src/app/dashboard/runs/[id]/_shared/run-activity-panel.tsx
//
// Fetches GET /api/skill-runs/[id] (status, steps, duration, error) and
// renders it inline via the same StepTimeline the full run-detail page
// uses. Built so pipeline drawers (Pre-Call Read, Win-Back, Pile-On) can
// answer "what actually happened on that run" without sending the user to
// /dashboard/runs/[id] just to see a status and a step list — the drawer
// already has the room, and the data is one cheap fetch away.
//
// Deliberately leaves out costInCents (which the full run page does show)
// — this panel renders inside client-facing pipeline drawers, and
// per-run AI processing cost is Anthropic/Anthropic-model spend on this
// app's side, not a business metric the buyer needs. errorMessage is
// never shown raw either: it goes through classifyRunError first (see
// error-classification.ts) for a plain-language diagnosis, falling back
// to a generic "nothing you need to do" note rather than exception text
// when it can't be classified.

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { StepTimeline } from "../step-timeline";
import { runStatusLabel, RUN_DETAIL_COPY as copy } from "@/lib/copy";
import { classifyRunError } from "@/lib/error-classification";
import type { RunStep } from "@/models/schema";

interface RunActivitySnapshot {
  id: string;
  status: string;
  steps: RunStep[] | null;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
}

function formatDuration(ms: number | null): string {
  if (ms === null || ms < 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

export function RunActivityPanel({ runId }: { runId: string }) {
  const [run, setRun] = useState<RunActivitySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/skill-runs/${runId}`, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load run activity.");
        return res.json();
      })
      .then((body) => {
        if (!cancelled) setRun(body.run);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load run activity.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [runId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6 text-zinc-600 font-sans">
        <Loader2 size={15} className="animate-spin" />
      </div>
    );
  }

  if (error || !run) {
    return <p className="text-[11px] text-zinc-500 italic font-sans">{error ?? "Run activity unavailable."}</p>;
  }

  const steps = run.steps ?? [];
  const isRunning = run.status === "running" || run.status === "queued";

  return (
    <div className="space-y-3 font-sans">
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 py-2">
          <span className="block text-[9px] font-mono uppercase text-zinc-500">Status</span>
          <span className="block text-[11px] font-semibold text-white mt-0.5 truncate px-1">{runStatusLabel(run.status)}</span>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 py-2">
          <span className="block text-[9px] font-mono uppercase text-zinc-500">Duration</span>
          <span className="block text-[11px] font-mono font-semibold text-white mt-0.5">{formatDuration(run.durationMs)}</span>
        </div>
      </div>

      {run.errorMessage && (() => {
        const diagnosis = classifyRunError(run.errorMessage);
        return (
          <div className="rounded-lg border border-rose-900/50 bg-rose-950/20 px-2.5 py-1.5 font-sans">
            <span className="block text-[10px] font-mono uppercase text-rose-400/80 mb-0.5">{copy.errorSectionTitle}</span>
            {diagnosis ? (
              <>
                <p className="text-[11px] font-semibold text-rose-300">{diagnosis.title}</p>
                <p className="text-[11px] text-rose-300/90 mt-0.5">{diagnosis.explanation}</p>
              </>
            ) : (
              // Not every failure fits the classifier's known patterns — rather
              // than show the raw exception text (which can read like a stack
              // trace), fall back to something a buyer can actually act on.
              <p className="text-[11px] text-rose-300/90">
                This run hit an unexpected error. There&apos;s nothing you need to do — if it keeps happening, let your account contact know.
              </p>
            )}
          </div>
        );
      })()}

      {steps.length > 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-2.5 max-h-[300px] overflow-y-auto">
          <StepTimeline steps={steps} isRunning={isRunning} runStatus={run.status} />
        </div>
      ) : (
        <p className="text-[11px] text-zinc-500 italic font-sans">{copy.noStepsRecorded}</p>
      )}
    </div>
  );
}
