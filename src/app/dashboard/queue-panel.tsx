"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, X, ArrowUpRight, ShieldAlert, CircleAlert, Info, ClipboardCheck } from "lucide-react";
import { QUEUE_COPY as copy } from "@/lib/copy";

export interface QueueItemDTO {
  id: string;
  source: "action" | "blocker" | "notification";
  category: "approve" | "action_needed" | "alert" | "fyi";
  title: string;
  subtitle: string;
  engagementId: string | null;
  buyer: string | null;
  runId: string | null;
  createdAt: string;
}

const POLL_MS = 8_000;

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function CategoryBadge({ category }: { category: QueueItemDTO["category"] }) {
  const isGold = category !== "fyi";
  const icon =
    category === "approve" ? <ClipboardCheck size={11} /> :
    category === "action_needed" ? <ShieldAlert size={11} /> :
    category === "alert" ? <CircleAlert size={11} /> :
    <Info size={11} />;

  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider shrink-0 ${
        isGold
          ? "bg-gold/10 text-gold-hover dark:text-gold border border-gold/25"
          : "bg-muted text-muted-foreground border border-border"
      }`}
    >
      {icon}
      {copy.categoryLabels[category]}
    </span>
  );
}

/**
 * The dashboard queue — a unified, actionable view over everything
 * genuinely waiting on a human: pending_actions (approve/reject),
 * open human_blockers (resolve/dismiss), and unread notifications
 * (open/dismiss). Sits above the live execution feed on purpose (see
 * dashboard/page.tsx) — this is "what needs you," the feed below it is
 * "what's already running on its own."
 *
 * Mirrors live-execution-feed.tsx's poll-with-AbortController pattern.
 * Mutations go straight to the endpoints that already existed for each
 * source table (see src/lib/queue.ts's header comment) — this component
 * never writes to the database itself, only reads /api/queue and calls
 * those existing routes.
 */
export function QueuePanel({ initialItems }: { initialItems: QueueItemDTO[] }) {
  const [items, setItems] = useState<QueueItemDTO[]>(initialItems);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string>(copy.errors.generic);
  const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (signal: AbortSignal) => {
    try {
      const res = await fetch("/api/queue", { cache: "no-store", signal });
      if (signal.aborted || !res.ok) return;
      const data = await res.json();
      if (signal.aborted) return;
      setItems(data.items ?? []);
    } catch {
      // Silent — includes AbortError on unmount; a missed poll just tries
      // again next interval, same as the notification bell and live feed.
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const interval = setInterval(() => load(controller.signal), POLL_MS);
    return () => {
      clearInterval(interval);
      controller.abort();
    };
  }, [load]);

  useEffect(() => () => {
    if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
  }, []);

  function flashError(id: string, text: string) {
    setErrorId(id);
    setErrorText(text);
    if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
    errorTimeoutRef.current = setTimeout(() => setErrorId(null), 4000);
  }

  async function runMutation(item: QueueItemDTO, url: string, body?: object) {
    setBusyId(item.id);
    setErrorId(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const message = res.status === 403
          ? copy.errors.adminOnly
          : await res.json().then((d) => d?.error).catch(() => null) || copy.errors.generic;
        flashError(item.id, message);
        return;
      }
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } catch {
      flashError(item.id, copy.errors.generic);
    } finally {
      setBusyId(null);
    }
  }

  function decide(item: QueueItemDTO, decision: string) {
    if (item.source === "action") {
      return runMutation(item, `/api/actions/${item.id}/review`, { decision });
    }
    if (item.source === "blocker") {
      return runMutation(item, `/api/blockers/${item.id}/resolve`, { decision });
    }
    return runMutation(item, `/api/notifications/${item.id}/read`);
  }

  const openHref = (item: QueueItemDTO) =>
    item.runId ? `/dashboard/runs/${item.runId}` : item.engagementId ? `/dashboard/engagements/${item.engagementId}` : null;

  if (items.length === 0) {
    return (
      <div className="pt-1 border-t border-border/60">
        <p className="text-xs font-mono font-medium text-muted-foreground/80 py-6 text-center">
          {copy.emptyState}
        </p>
      </div>
    );
  }

  return (
    <div className="pt-1 border-t border-border/60 divide-y divide-border/60">
      {items.map((item) => {
        const isBusy = busyId === item.id;
        const href = openHref(item);

        return (
          <div
            key={item.id}
            className="flex items-center gap-3 py-3 first:pt-2"
          >
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <CategoryBadge category={item.category} />
                <p className="text-sm font-medium text-foreground truncate">{item.title}</p>
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {item.buyer ? `${item.buyer} · ` : ""}
                {item.subtitle}
                {" · "}
                {relativeTime(item.createdAt)}
              </p>
              {errorId === item.id && (
                <p className="text-[11px] text-destructive font-mono">{errorText}</p>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {item.category === "approve" && (
                <>
                  <button
                    disabled={isBusy}
                    onClick={() => decide(item, "approved")}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md bg-gold text-gold-foreground hover:bg-gold-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <Check size={13} /> {copy.actions.approve}
                  </button>
                  <button
                    disabled={isBusy}
                    onClick={() => decide(item, "rejected")}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <X size={13} /> {copy.actions.reject}
                  </button>
                </>
              )}

              {item.category === "action_needed" && (
                <>
                  <button
                    disabled={isBusy}
                    onClick={() => decide(item, "resolved")}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md bg-gold text-gold-foreground hover:bg-gold-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <Check size={13} /> {copy.actions.resolve}
                  </button>
                  <button
                    disabled={isBusy}
                    onClick={() => decide(item, "abandoned")}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <X size={13} /> {copy.actions.dismiss}
                  </button>
                </>
              )}

              {(item.category === "alert" || item.category === "fyi") && (
                <>
                  {href ? (
                    <Link
                      href={href}
                      onClick={() => setItems((prev) => prev.filter((i) => i.id !== item.id))}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md bg-gold text-gold-foreground hover:bg-gold-hover transition-colors"
                    >
                      <ArrowUpRight size={13} /> {copy.actions.open}
                    </Link>
                  ) : null}
                  <button
                    disabled={isBusy}
                    onClick={() => runMutation(item, `/api/notifications/${item.id}/read`)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <X size={13} /> {copy.actions.dismiss}
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
