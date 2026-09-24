"use client";

// The third compartment for Run History — same idea as the Details panel
// on the dashboard's unified queue (unified-activity-panel.tsx): clicking
// a row opens the run beside the list instead of navigating away, so
// checking what a run did doesn't cost a page load and a Back click. The
// full run page is still one link away for anything this doesn't show.

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Loader2, X } from "lucide-react";
import { AnySkillBadge } from "@/components/any-skill-badge";
import { anySkillDisplayName } from "@/lib/any-skill";
import { phaseLabel, runStatusLabel, runStatusColor } from "@/lib/copy";
import { formatReadableDuration } from "@/lib/format-datetime";
import { StepTimeline } from "@/app/dashboard/runs/[id]/step-timeline";
import type { RunStep } from "@/models/schema";

interface RunDetail {
  id: string;
  skillName: string;
  status: string;
  phase: string | null;
  steps: RunStep[] | null;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
}

const LIVE_STATUSES = new Set(["running", "in_progress", "queued", "pending"]);
const POLL_MS = 3000;

export function RunHistoryDetail({ runId, onClose }: { runId: string; onClose: () => void }) {
  const [run, setRun] = useState<RunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Reset when a different row is opened — "adjust state during render"
  // instead of an effect, so the old run never flashes under the new id.
  const [loadedFor, setLoadedFor] = useState(runId);
  if (loadedFor !== runId) {
    setLoadedFor(runId);
    setRun(null);
    setError(null);
  }

  const isLive = run ? LIVE_STATUSES.has(run.status.toLowerCase()) : false;

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function load() {
      try {
        const res = await fetch(`/api/skill-runs/${runId}`, { cache: "no-store", signal: controller.signal });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Couldn't load this run.");
        setRun(data.run);
        // Keep a live run's steps moving, same 3s cadence as the run page.
        if (LIVE_STATUSES.has(String(data.run.status).toLowerCase())) timer = setTimeout(load, POLL_MS);
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : "Couldn't load this run.");
      }
    }
    load();

    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [runId]);

  const steps = run?.steps ?? [];
  const duration = run ? formatReadableDuration(run.durationMs) : null;

  return (
    <>
      <div className="flex items-center justify-between px-4 h-11 border-b border-zinc-200/80 dark:border-zinc-800/80 shrink-0">
        <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Details</span>
        <button
          type="button"
          onClick={onClose}
          className="flex items-center justify-center w-7 h-7 rounded-md text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors cursor-pointer"
          aria-label="Close run details"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 text-sm space-y-4">
        {error ? (
          <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
        ) : !run ? (
          <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
            <Loader2 size={14} className="animate-spin" /> Loading run…
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2.5">
              <AnySkillBadge skill={run.skillName} size={26} />
              <div className="min-w-0">
                <p className="text-base font-bold text-zinc-900 dark:text-zinc-100 truncate">{anySkillDisplayName(run.skillName)}</p>
                <p className={`text-sm font-mono ${runStatusColor(run.status)}`}>{runStatusLabel(run.status)}</p>
              </div>
            </div>

            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-zinc-500 dark:text-zinc-400">Started</dt>
              <dd className="text-zinc-800 dark:text-zinc-200">{new Date(run.startedAt).toLocaleString()}</dd>
              {duration && (
                <>
                  <dt className="text-zinc-500 dark:text-zinc-400">Took</dt>
                  <dd className="text-zinc-800 dark:text-zinc-200">{duration}</dd>
                </>
              )}
              {run.phase && (
                <>
                  <dt className="text-zinc-500 dark:text-zinc-400">Phase</dt>
                  <dd className="text-zinc-800 dark:text-zinc-200">{phaseLabel(run.phase)}</dd>
                </>
              )}
            </dl>

            {run.errorMessage && (
              <p className="text-sm text-rose-600 dark:text-rose-400 font-mono whitespace-pre-line break-words">{run.errorMessage}</p>
            )}

            {steps.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-mono uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  {steps.length} step{steps.length === 1 ? "" : "s"}
                </p>
                <StepTimeline steps={steps} isRunning={isLive} runStatus={run.status} />
              </div>
            )}

            <Link
              href={`/dashboard/runs/${run.id}`}
              className="inline-flex items-center gap-1 text-sm font-mono text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors"
            >
              View full run <ArrowUpRight className="w-3 h-3" />
            </Link>
          </>
        )}
      </div>
    </>
  );
}
