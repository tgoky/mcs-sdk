"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  Ban,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Clock3,
  Coins,
  Cpu,
  ExternalLink,
  FileText,
  Loader2,
  Terminal,
  XCircle,
  Wrench,
} from "lucide-react";
import { CancelRunButton } from "../../cancel-run-button";
import { StepTimeline } from "./step-timeline";
import { PinDownView } from "./views/pin-down-view";
import { PileOnView } from "./views/pile-on-view";
import { PreCallReadView } from "./views/pre-call-read-view";
import { WinBackView } from "./views/win-back-view";
import { LeakMapView } from "./views/leak-map-view";
import { skillName, phaseLabel, runStatusLabel, RUN_DETAIL_COPY as copy } from "@/lib/copy";
import { BackLink } from "@/components/back-link";
import { SetBreadcrumbLabel } from "@/components/breadcrumbs/breadcrumb-context";
import type { RunStep, RunSummary } from "@/models/schema";
import type { RunDetailPayload } from "./_shared/types";

interface RunDetail {
  id: string;
  skillName: string;
  status: string;
  phase: string | null;
  steps: RunStep[] | null;
  summary: RunSummary | null;
  errorMessage: string | null;
  tokenUsage: { input_tokens: number; output_tokens: number } | null;
  costInCents: number | null;
  startedAt: string;
  completedAt: string | null;
  engagementId: string;
  buyerName: string | null;
  durationMs: number | null;
}

function formatDuration(ms: number | null): string {
  if (ms === null || ms < 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

function formatCost(cents: number | null): string {
  if (cents === null || cents === 0) return "—";
  return `$${(cents / 100).toFixed(4)}`;
}

function RunStatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const config = {
    success: {
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
      className: "border-emerald-900/60 bg-emerald-950/30 text-emerald-400",
    },
    completed: {
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
      className: "border-emerald-900/60 bg-emerald-950/30 text-emerald-400",
    },
    failed: {
      icon: <XCircle className="h-3.5 w-3.5" />,
      className: "border-rose-900/60 bg-rose-950/30 text-rose-400",
    },
    cancelled: {
      icon: <Ban className="h-3.5 w-3.5" />,
      className: "border-zinc-800 bg-zinc-900 text-zinc-400",
    },
    timed_out: {
      icon: <Clock3 className="h-3.5 w-3.5" />,
      className: "border-amber-900/60 bg-amber-950/30 text-amber-400",
    },
    running: {
      icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
      className: "border-sky-900/60 bg-sky-950/30 text-sky-400",
    },
  }[normalized] ?? {
    icon: <AlertCircle className="h-3.5 w-3.5" />,
    className: "border-zinc-800 bg-zinc-900 text-zinc-400",
  };

  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold tracking-wide ${config.className}`}>
      {config.icon}
      {runStatusLabel(status)}
    </span>
  );
}

function SkillView({ detail, steps, onRefreshDetail }: { detail: RunDetailPayload; steps: RunStep[]; onRefreshDetail: () => void }) {
  switch (detail.run.skillName) {
    case "pre-call-read":
      return "calls" in detail ? <PreCallReadView detail={detail} steps={steps} onRefreshDetail={onRefreshDetail} /> : null;
    case "pile-on":
      return "send" in detail ? <PileOnView detail={detail} steps={steps} /> : null;
    case "win-back":
      return "enrollment" in detail ? <WinBackView detail={detail} /> : null;
    case "leak-map":
      return "audit" in detail ? <LeakMapView detail={detail} /> : null;
    case "pin-down":
    default:
      return <PinDownView detail={detail} />;
  }
}

function SummarySection({ summary }: { summary: RunSummary }) {
  const fields: { key: keyof RunSummary; label: string; emptyText?: string; tone: string }[] = [
    { key: "whatWasAttempted", label: "What ran", tone: "text-zinc-400" },
    { key: "whatWorked", label: "What worked", tone: "text-emerald-400" },
    { key: "whatFailed", label: "What needs attention", emptyText: copy.noFailuresNote, tone: "text-rose-400" },
    { key: "openItems", label: "Open items", tone: "text-amber-400" },
    { key: "decisionsMade", label: "Decisions", tone: "text-sky-400" },
  ];

  const visibleFields = fields.filter(({ key }) => (summary[key]?.length ?? 0) > 0 || key === "whatFailed");
  if (visibleFields.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/40">
      <div className="flex items-center gap-2 border-b border-zinc-800/80 px-4 py-3">
        <FileText className="h-4 w-4 text-zinc-500" />
        <h2 className="text-xs font-semibold text-zinc-200">{copy.summarySectionTitle}</h2>
      </div>
      <div className="divide-y divide-zinc-800/80">
        {visibleFields.map(({ key, label, emptyText, tone }) => {
          const items = summary[key] ?? [];
          return (
            <div key={key} className="px-4 py-3">
              <p className={`text-[10px] font-bold uppercase tracking-wider ${tone}`}>{label}</p>
              {items.length > 0 ? (
                <ul className="mt-1.5 space-y-1">
                  {items.map((item, index) => (
                    <li key={index} className="flex gap-2 text-xs leading-relaxed text-zinc-300">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-zinc-600" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-zinc-500">{emptyText}</p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function RunDetailPage() {
  const params = useParams();
  const runId = params?.id as string;
  const [run, setRun] = useState<RunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<RunDetailPayload | null>(null);
  const [detailLoading, setDetailLoading] = useState(true);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(true);
  
  const techDetailsRef = useRef<HTMLDivElement>(null);

  const fetchRun = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(`/api/skill-runs/${runId}`, { cache: "no-store", signal });
      if (!response.ok) return;
      const data = await response.json();
      setRun(data.run);
    } catch {
      // Polling failure gracefully ignored
    }
  }, [runId]);

  const fetchDetail = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(`/api/skill-runs/${runId}/detail`, { cache: "no-store", signal });
      if (!response.ok) return;
      const data = await response.json();
      setDetail(data);
    } catch {
      // gracefully ignored
    }
  }, [runId]);

  useEffect(() => {
    if (!runId) return;
    const controller = new AbortController();

    (async () => {
      try {
        const response = await fetch(`/api/skill-runs/${runId}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          setError(body.error ?? "Failed to load run data");
          return;
        }
        const data = await response.json();
        setRun(data.run);
      } catch (cause: unknown) {
        if (cause instanceof Error && cause.name !== "AbortError") setError(cause.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [runId]);

  useEffect(() => {
    if (!runId) return;
    const controller = new AbortController();
    
    // FIX: Defer synchronous setState to prevent cascading render warning
    const timeoutId = setTimeout(() => setDetailLoading(true), 0);

    (async () => {
      try {
        const response = await fetch(`/api/skill-runs/${runId}/detail`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) return;
        const data = await response.json();
        setDetail(data);
      } catch (cause: unknown) {
        if (cause instanceof Error && cause.name !== "AbortError") {
          console.error("Failed to load skill-specific run detail:", cause.message);
        }
      } finally {
        if (!controller.signal.aborted) setDetailLoading(false);
      }
    })();
    
    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [runId]);

  const isRunning = run?.status === "running";

  // FIX: Auto-expand and scroll to technical details when a run is live
  useEffect(() => {
    if (isRunning) {
      // Defer state update and DOM manipulation to prevent synchronous setState warning
      const timeoutId = setTimeout(() => {
        setShowTechnicalDetails(true);
        techDetailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 0);
      return () => clearTimeout(timeoutId);
    }
  }, [isRunning]);

  useEffect(() => {
    if (!isRunning) return;
    const controller = new AbortController();
    const intervalId = window.setInterval(() => fetchRun(controller.signal), 3000);
    return () => {
      window.clearInterval(intervalId);
      controller.abort();
    };
  }, [fetchRun, isRunning]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (error || !run) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 py-3">
        <BackLink href="/dashboard" label="Back to dashboard" />
        <div className="rounded-xl border border-rose-900/50 bg-rose-950/20 px-6 py-10 text-center">
          <XCircle className="mx-auto mb-3 h-7 w-7 text-rose-500" />
          <p className="text-sm font-semibold text-rose-300">{error ?? "Run trace not found"}</p>
        </div>
      </div>
    );
  }

  const steps = run.steps ?? [];
  const isFailed = run.status === "failed";
  const isCancelled = run.status === "cancelled";
  const isTimedOut = run.status === "timed_out";

  return (
    <div className="mx-auto w-full max-w-6xl space-y-3 pb-8 text-zinc-300 font-sans">
      <SetBreadcrumbLabel label={`${skillName(run.skillName)} run`} />

      {/* ----------------------------------------------------------------- */}
      {/* 1. COMPACT 1-LINE HEADER                                          */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-2.5">
        <div className="flex items-center gap-3 min-w-0">
          <BackLink
            href={run.engagementId ? `/dashboard/engagements/${run.engagementId}` : "/dashboard"}
            label={run.engagementId ? `Back to ${run.buyerName ?? "client"}` : "Back to dashboard"}
          />
          <span className="text-zinc-700">|</span>
          <h1 className="text-base font-bold tracking-tight text-white truncate">
            {skillName(run.skillName)}
          </h1>
          <span className="text-xs text-zinc-500 hidden sm:inline">
            {run.buyerName ? `(${run.buyerName})` : ""}
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0 text-xs text-zinc-400 font-mono">
          <span>{formatDuration(run.durationMs)}</span>
          <span className="text-zinc-800">•</span>
          <span>{formatCost(run.costInCents)}</span>
          <RunStatusBadge status={run.status} />
          {isRunning && <CancelRunButton runId={runId} onCancelled={() => fetchRun()} />}
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* 2. ASANA-STYLE COMPACT TOP DIAGNOSTIC BANNER (WHEN FAILED)       */}
      {/* ----------------------------------------------------------------- */}
      {isFailed && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-900/60 bg-rose-950/30 px-3.5 py-2 text-xs text-rose-200 shadow-sm">
          <div className="flex items-center gap-2 min-w-0">
            <CircleAlert size={15} className="text-rose-400 shrink-0" />
            <div className="flex items-center gap-2 truncate">
              <span className="font-bold text-rose-300">Run Failed:</span>
              <span className="truncate text-rose-200/90 font-mono text-[11px]">
                {run.errorMessage ?? "An unexpected error occurred during step execution."}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 ml-auto">
            {run.engagementId && (
              <Link
                href={`/dashboard/engagements/${run.engagementId}?fixSection=booking#stack-settings`}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30 transition-colors"
              >
                <Wrench size={12} />
                <span>Fix Settings</span>
              </Link>
            )}
          </div>
        </div>
      )}

      {isCancelled && (
        <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-3.5 py-2 text-xs text-zinc-400">
          <Ban size={14} className="text-zinc-500" />
          <span>Run was manually cancelled by user.</span>
        </div>
      )}

      {isTimedOut && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-900/50 bg-amber-950/20 px-3.5 py-2 text-xs text-amber-300">
          <Clock3 size={14} className="text-amber-400" />
          <span>Run timed out after exceeding its maximum runtime ceiling.</span>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* 3. STATUS UPDATES & TECHNICAL DETAILS (MOVED UP)                  */}
      {/* ----------------------------------------------------------------- */}
      <div ref={techDetailsRef} className="pt-2">
        <button
          type="button"
          onClick={() => setShowTechnicalDetails((p) => !p)}
          className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 transition-colors hover:text-white cursor-pointer select-none"
        >
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showTechnicalDetails ? "rotate-180" : ""}`} />
          <span>{showTechnicalDetails ? "Hide" : "Show"} technical details</span>
          <span className="text-zinc-600">·</span>
          <span className="text-zinc-500">{steps.length} step{steps.length === 1 ? "" : "s"}, phase timeline & raw metadata</span>
        </button>

        {showTechnicalDetails && (
          <div className="mt-3 grid items-start gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.85fr)]">
            <section className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
              <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
                <span className="text-xs font-semibold text-zinc-200">Execution Steps</span>
                <span className="text-[11px] font-mono text-zinc-500">{steps.length} steps</span>
              </div>
              <div className="max-h-[75vh] overflow-y-auto p-4">
                {steps.length === 0 ? (
                  <p className="text-xs text-zinc-500 italic text-center py-6">{copy.noStepsRecorded}</p>
                ) : (
                  <StepTimeline steps={steps} isRunning={isRunning} runStatus={run.status} />
                )}
              </div>
            </section>

            <aside className="space-y-4">
              {run.summary && <SummarySection summary={run.summary} />}
              <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-xs space-y-2 font-mono">
                <span className="text-[10px] uppercase text-zinc-500 block font-sans font-bold">Metadata</span>
                <div className="flex justify-between text-zinc-400">
                  <span>Started:</span>
                  <span className="text-zinc-200">{new Date(run.startedAt).toLocaleTimeString()}</span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Run ID:</span>
                  <span className="text-zinc-500 text-[10px] truncate max-w-[150px]">{run.id}</span>
                </div>
              </div>
            </aside>
          </div>
        )}
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* 4. AUTOMATION DELIVERABLES (MOVED DOWN)                           */}
      {/* ----------------------------------------------------------------- */}
      <main className="w-full">
        {detailLoading && !detail ? (
          <div className="flex h-40 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-950">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-600" />
          </div>
        ) : detail && detail.run.id === run.id ? (
          <SkillView detail={detail} steps={steps} onRefreshDetail={fetchDetail} />
        ) : (
          <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/30 px-6 py-10 text-center text-xs text-zinc-500">
            Skill-specific detail is not available for this run.
          </div>
        )}
      </main>
    </div>
  );
}