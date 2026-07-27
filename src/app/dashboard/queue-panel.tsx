"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, X, ArrowUpRight, ShieldAlert, CircleAlert, Info, ClipboardCheck } from "lucide-react";
import { QUEUE_COPY as copy } from "@/lib/copy";
import { HoverPreview, useHoverPreview } from "@/components/hover-preview";

export interface QueueItemDTO {
  id: string;
  source: "action" | "blocker" | "notification" | "sync_setup" | "run_failure";
  category: "approve" | "action_needed" | "alert" | "fyi";
  title: string;
  subtitle: string;
  engagementId: string | null;
  buyer: string | null;
  runId: string | null;
  createdAt: string;
  fixHref?: string;
  skillName?: string;
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
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-mono font-bold uppercase tracking-wider shrink-0 ${
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

function QueueItemPreview({ item }: { item: QueueItemDTO }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <CategoryBadge category={item.category} />
      </div>
      <p className="font-semibold text-foreground leading-snug">{item.title}</p>
      <p className="text-muted-foreground leading-snug">{item.subtitle}</p>
      {item.buyer && <p className="font-mono text-muted-foreground/80">{item.buyer}</p>}
      <p className="text-muted-foreground/70">{relativeTime(item.createdAt)}</p>
    </div>
  );
}

function QueueRow({
  item,
  isBusy,
  errorText,
  href,
  onDecide,
  onDismissSyncSetup,
  onDismissRunFailure,
  onRunMutation,
  onLinkNavigate,
}: {
  item: QueueItemDTO;
  isBusy: boolean;
  errorText: string | null;
  href: string | null;
  onDecide: (decision: string) => void;
  onDismissSyncSetup: () => void;
  onDismissRunFailure: () => void;
  onRunMutation: (url: string) => void;
  onLinkNavigate: () => void;
}) {
  const { ref, hovering, onMouseEnter, onMouseLeave } = useHoverPreview<HTMLDivElement>();

  return (
    <>
      <div
        ref={ref}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
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
          {errorText && (
            <p className="text-[14px] text-destructive font-mono">{errorText}</p>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {item.category === "approve" && (
            <>
              <button
                disabled={isBusy}
                onClick={() => onDecide("approved")}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md bg-gold text-gold-foreground hover:bg-gold-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <Check size={13} /> {copy.actions.approve}
              </button>
              <button
                disabled={isBusy}
                onClick={() => onDecide("rejected")}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <X size={13} /> {copy.actions.reject}
              </button>
            </>
          )}

          {item.category === "action_needed" && item.source === "sync_setup" && (
            <>
              {href ? (
                <Link
                  href={href}
                  onClick={onLinkNavigate}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md bg-gold text-gold-foreground hover:bg-gold-hover transition-colors"
                >
                  <ArrowUpRight size={13} /> Review
                </Link>
              ) : null}
              <button
                disabled={isBusy}
                onClick={onDismissSyncSetup}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <X size={13} /> Not now
              </button>
            </>
          )}

          {item.category === "action_needed" && item.source === "run_failure" && (
            <>
              {href ? (
                <Link
                  href={href}
                  onClick={onLinkNavigate}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md bg-gold text-gold-foreground hover:bg-gold-hover transition-colors"
                >
                  <ArrowUpRight size={13} /> Fix now
                </Link>
              ) : null}
              <button
                disabled={isBusy}
                onClick={onDismissRunFailure}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <X size={13} /> Not now
              </button>
            </>
          )}

          {item.category === "action_needed" && item.source !== "sync_setup" && item.source !== "run_failure" && (
            <>
              <button
                disabled={isBusy}
                onClick={() => onDecide("resolved")}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md bg-gold text-gold-foreground hover:bg-gold-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <Check size={13} /> {copy.actions.resolve}
              </button>
              <button
                disabled={isBusy}
                onClick={() => onDecide("abandoned")}
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
                  onClick={onLinkNavigate}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md bg-gold text-gold-foreground hover:bg-gold-hover transition-colors"
                >
                  <ArrowUpRight size={13} /> {copy.actions.open}
                </Link>
              ) : null}
              <button
                disabled={isBusy}
                onClick={() => onRunMutation(`/api/notifications/${item.id}/read`)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <X size={13} /> {copy.actions.dismiss}
              </button>
            </>
          )}
        </div>
      </div>
      <HoverPreview anchorRef={ref} hovering={hovering} preview={<QueueItemPreview item={item} />} />
    </>
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

  // Client-side pagination over the already-fetched, already-prioritized
  // list (see src/lib/queue.ts) rather than a server-paginated query —
  // this list is a read-time merge of five different source tables/
  // synthesized states, so "page 2 of the merge" doesn't correspond to
  // any single offset/limit a database query could express. The full
  // list is never large enough (bounded by "currently outstanding work,"
  // not historical volume, unlike run history) for fetching all of it up
  // front to be a real cost.
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<5 | 10>(10);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  // Derived at render time rather than synced via an effect that calls
  // setPage — a poll refresh or a resolved/dismissed item can shrink
  // `items` out from under whatever page the user was on, and clamping
  // here (instead of scheduling a state update to correct it a render
  // later) means the displayed page is never wrong even for one frame.
  const clampedPage = Math.min(page, pageCount - 1);

  const pagedItems = items.slice(clampedPage * pageSize, clampedPage * pageSize + pageSize);

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

  async function runMutation(item: QueueItemDTO, url: string, body?: object, method: "POST" | "PATCH" = "POST") {
    setBusyId(item.id);
    setErrorId(null);
    try {
      const res = await fetch(url, {
        method,
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

  // sync_setup items are synthesized read-time from engagement.stack (see
  // src/lib/queue.ts) — there's no pending_actions/human_blockers/
  // notifications row behind them, so "resolve" means "go set it up" and
  // "dismiss" means PATCH the engagement's own webhook_receiver_setup_dismissed
  // flag, not any of the three existing decision endpoints above.
  function dismissSyncSetup(item: QueueItemDTO) {
    if (!item.engagementId) return;
    return runMutation(
      item,
      `/api/engagements/${item.engagementId}/sync-mode`,
      { dismissSetupNudge: true },
      "PATCH"
    );
  }

  // run_failure items are synthesized read-time from a classified skillRuns
  // failure (see src/lib/error-classification.ts + queue.ts) — same
  // "no real row behind it" situation as sync_setup above, so dismissal
  // goes through its own dedicated endpoint rather than the generic
  // decide() paths, which all assume a real pending_actions/human_blockers/
  // notifications row with an id they can PATCH by.
  function dismissRunFailure(item: QueueItemDTO) {
    if (!item.engagementId || !item.skillName) return;
    return runMutation(
      item,
      `/api/engagements/${item.engagementId}/dismiss-run-failure`,
      { skillName: item.skillName },
      "PATCH"
    );
  }

  const openHref = (item: QueueItemDTO) =>
    item.fixHref ?? (item.runId ? `/dashboard/runs/${item.runId}` : item.engagementId ? `/dashboard/engagements/${item.engagementId}` : null);

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
    <div className="pt-1 border-t border-border/60">
      <div className="divide-y divide-border/60">
        {pagedItems.map((item) => (
          <QueueRow
            key={item.id}
            item={item}
            isBusy={busyId === item.id}
            errorText={errorId === item.id ? errorText : null}
            href={openHref(item)}
            onDecide={(decision) => decide(item, decision)}
            onDismissSyncSetup={() => dismissSyncSetup(item)}
            onDismissRunFailure={() => dismissRunFailure(item)}
            onRunMutation={(url) => runMutation(item, url)}
            onLinkNavigate={() => setItems((prev) => prev.filter((i) => i.id !== item.id))}
          />
        ))}
      </div>

      {items.length > 5 && (
        <div className="flex items-center justify-between px-1 py-2 border-t border-border/60">
          <div className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
            {([5, 10] as const).map((size) => (
              <button
                key={size}
                onClick={() => { setPageSize(size); setPage(0); }}
                className={`px-1.5 py-0.5 rounded border transition-colors cursor-pointer ${
                  pageSize === size
                    ? "border-gold/40 bg-gold/10 text-gold-hover dark:text-gold"
                    : "border-transparent hover:text-foreground"
                }`}
              >
                {size}/page
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-muted-foreground">Page {clampedPage + 1} of {pageCount}</span>
            <button
              onClick={() => setPage(Math.max(0, clampedPage - 1))}
              disabled={clampedPage === 0}
              className="px-2 py-1 text-[10px] font-mono font-bold rounded border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              ← Prev
            </button>
            <button
              onClick={() => setPage(Math.min(pageCount - 1, clampedPage + 1))}
              disabled={clampedPage >= pageCount - 1}
              className="px-2 py-1 text-[10px] font-mono font-bold rounded border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}