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

/**
 * Live evidence that the platform caught a booking the instant it happened
 * — not just a new row quietly appearing in a table somewhere. Every
 * booking today already creates a "pile-on" skillRuns row via the Calendly
 * webhook (see src/app/api/webhooks/booking-event/route.ts) and the
 * prospect's name/email is already captured in that run's step log by
 * src/features/pile-on/server/enrollment-service.ts — it just never
 * surfaced anywhere in the UI until the /api/skill-runs/recent endpoint
 * started returning it as `subjectLabel`.
 *
 * Mounted once at the dashboard layout level so it fires no matter which
 * page a buyer is looking at, the same way the notification bell does.
 *
 * Polling-based rather than a websocket/SSE push — deliberately, to match
 * the rest of this app's architecture (LiveExecutionFeed, the notification
 * bell) instead of introducing a second real-time transport for one
 * feature. The tradeoff is up to POLL_MS latency before a toast appears,
 * which is an acceptable trade for not maintaining a second live channel.
 */
export function BookingToast() {
  const router = useRouter();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const seenRunIds = useRef<Set<string>>(new Set());
  const isFirstPoll = useRef(true);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/skill-runs/recent", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const runs: RecentRun[] = data.runs ?? [];

      // First poll after mount just establishes the baseline — otherwise
      // every run that already existed before this component mounted
      // would fire a toast the instant the dashboard loads.
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

        // Only genuinely new inbound-booking events get a toast — a run
        // reappearing because it moved from "running" to "success" isn't
        // new, it's the same id already in seenRunIds by then. We only
        // care about pile-on (new booking) and win-back (rebooked/exit)
        // runs seeded from the Calendly webhook, not every skill run.
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
        setToasts((prev) => [...newToasts, ...prev].slice(0, 4)); // cap stack at 4
      }
    } catch {
      // Silent — same reasoning as the notification bell's poll: a missed
      // beat just means the toast for that booking shows up ~5s late on
      // the next successful poll, or the buyer sees it in the Live
      // Executions table regardless. Never worth surfacing as an error.
    }
  }, []);

  useEffect(() => {
    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => clearInterval(interval);
  }, [poll]);

  // Auto-dismiss each toast on its own timer.
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
    <div className="fixed top-4 right-4 z-[60] flex flex-col gap-2 w-80 pointer-events-none">
      {toasts.map((t) => (
        <button
          key={t.runId}
          onClick={() => openRun(t.runId)}
          className="pointer-events-auto text-left bg-zinc-950 border border-zinc-800 rounded-lg shadow-2xl overflow-hidden animate-[slideIn_0.25s_ease-out] hover:border-zinc-700 transition-colors group"
        >
          <div className="flex items-start gap-3 p-3.5">
            <div
              className={`flex items-center justify-center w-8 h-8 rounded-full shrink-0 ${
                t.kind === "booking" ? "bg-emerald-950/60 text-emerald-400" : "bg-sky-950/60 text-sky-400"
              }`}
            >
              {t.kind === "booking" ? <CalendarCheck2 size={15} /> : <RotateCcw size={15} />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-zinc-100 leading-snug">
                {t.kind === "booking" ? "New booking just landed" : "Prospect rebooked"}
              </p>
              <p className="text-xs text-zinc-400 leading-snug mt-0.5 truncate">{t.subject}</p>
              {t.buyerName && (
                <p className="text-[10px] text-zinc-600 mt-1 uppercase tracking-wide">{t.buyerName}</p>
              )}
            </div>
            <span
              onClick={(e) => {
                e.stopPropagation();
                dismiss(t.runId);
              }}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-600 hover:text-zinc-300 shrink-0"
            >
              <X size={13} />
            </span>
          </div>
          {/* Decaying progress bar showing time left before auto-dismiss */}
          <div className="h-0.5 bg-zinc-900">
            <div
              className={`h-full ${t.kind === "booking" ? "bg-emerald-500/70" : "bg-sky-500/70"}`}
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
