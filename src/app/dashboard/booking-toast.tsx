"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck2, X, RotateCcw } from "lucide-react";

interface RecentRun {
  id: string;
  skillName: string;
  status: string;
  phase: string | null;
  startedAt: string;
  engagementId?: string | null;
  buyerName?: string | null;
  subjectLabel?: string | null;
}

interface ToastItem {
  runId: string;
  kind: "booking" | "winback";
  subject: string;
  buyerName: string | null;
  engagementId: string | null;
  createdAt: number;
}

const POLL_MS = 5000;
const TOAST_LIFETIME_MS = 8000;

export function BookingToast() {
  const router = useRouter();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const seenRunIds = useRef<Set<string>>(new Set());
  const isFirstPoll = useRef(true);

  const poll = useCallback(async (signal: AbortSignal) => {
    try {
      const res = await fetch("/api/skill-runs/recent", { cache: "no-store", signal });
      if (signal.aborted || !res.ok) return;
      const data = await res.json();
      if (signal.aborted) return;
      const runs: RecentRun[] = data.runs ?? [];

      if (isFirstPoll.current) {
        runs.forEach((r) => seenRunIds.current.add(r.id));
        isFirstPoll.current = false;
        return;
      }

      const fresh = runs.filter((r) => !seenRunIds.current.has(r.id));
      if (fresh.length === 0) return;

      const newToasts: ToastItem[] = [];
      for (const run of fresh) {
        seenRunIds.current.add(run.id);

        if (run.skillName === "pile-on") {
          newToasts.push({
            runId: run.id,
            kind: "booking",
            subject: run.subjectLabel ?? "New prospect",
            buyerName: run.buyerName ?? null,
            engagementId: run.engagementId ?? null,
            createdAt: Date.now(),
          });
        } else if (run.skillName === "win-back" && run.phase === "webhook_received") {
          newToasts.push({
            runId: run.id,
            kind: "winback",
            subject: run.subjectLabel ?? "A prospect",
            buyerName: run.buyerName ?? null,
            engagementId: run.engagementId ?? null,
            createdAt: Date.now(),
          });
        }
      }

      if (newToasts.length > 0) {
        setToasts((prev) => [...newToasts, ...prev].slice(0, 4));
      }
    } catch {
      // Silent poll handling
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      await poll(controller.signal);
    })();
    const interval = setInterval(() => poll(controller.signal), POLL_MS);
    return () => {
      clearInterval(interval);
      controller.abort();
    };
  }, [poll]);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((t) =>
      setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.runId !== t.runId));
      }, TOAST_LIFETIME_MS)
    );
    return () => timers.forEach(clearTimeout);
  }, [toasts]);

  function dismiss(runId: string) {
    setToasts((prev) => prev.filter((t) => t.runId !== runId));
  }

  function openRun(runId: string) {
    dismiss(runId);
    router.push(`/dashboard/runs/${runId}`);
  }

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[60] flex flex-col gap-2 w-80 pointer-events-none font-sans antialiased tracking-tight">
      {toasts.map((t) => (
        <button
          key={t.runId}
          onClick={() => openRun(t.runId)}
          className="pointer-events-auto text-left bg-white/95 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/90 rounded-2xl shadow-xl overflow-hidden animate-[slideIn_0.25s_ease-out] hover:border-zinc-300 dark:hover:border-zinc-700 transition-all group cursor-pointer font-sans"
        >
          <div className="flex items-start gap-3 p-3.5">
            <div
              className={`flex items-center justify-center w-8 h-8 rounded-xl shrink-0 ${
                t.kind === "booking"
                  ? "bg-ink/15 text-ink-hover dark:text-ink border border-ink/20"
                  : "bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 border border-sky-500/20"
              }`}
            >
              {t.kind === "booking" ? <CalendarCheck2 size={15} /> : <RotateCcw size={15} />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100 leading-snug tracking-tight font-sans">
                {t.kind === "booking" ? "New booking just landed" : "Prospect rebooked"}
              </p>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug mt-0.5 truncate font-medium font-sans">
                {t.subject}
              </p>
              {t.buyerName && (
                <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1 uppercase tracking-wider font-mono font-bold">
                  {t.buyerName}
                </p>
              )}
            </div>
            <span
              onClick={(e) => {
                e.stopPropagation();
                dismiss(t.runId);
              }}
              className="md:opacity-0 group-hover:opacity-100 transition-opacity text-zinc-400 dark:text-zinc-600 hover:text-zinc-700 dark:hover:text-zinc-300 shrink-0 p-0.5 cursor-pointer"
            >
              <X size={13} />
            </span>
          </div>

          <div className="h-0.5 bg-zinc-100 dark:bg-zinc-900">
            <div
              className={`h-full ${t.kind === "booking" ? "bg-ink/70" : "bg-sky-500/70"}`}
              style={{
                animation: `shrinkWidth ${TOAST_LIFETIME_MS}ms linear forwards`,
              }}
            />
          </div>
        </button>
      ))}
      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(16px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes shrinkWidth {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </div>
  );
}