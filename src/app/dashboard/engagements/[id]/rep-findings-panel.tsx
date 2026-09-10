"use client";

// src/app/dashboard/engagements/[id]/rep-findings-panel.tsx
//
// The per-engagement Reputation Manager findings page — one client's real
// history across every RM signal source. Originally five stacked
// section-cards (one per source, each finding also its own card) — cards
// nested inside cards, five copies of the same "trigger a check" layout
// always on screen at once. Reworked to match the timeline + diagnostic
// pattern the Leak Map skill page already established (see
// leak-map-schedule.tsx): one chronological feed across every source, a
// single detail panel for whatever's selected, and the "run a check"
// controls surfaced only for the source you're actually looking at instead
// of five forms competing for attention permanently.
//
// Every trigger here still calls the same chat-skill-trigger.ts functions
// Teammates chat already uses (via /api/engagements/[id]/rep-findings/
// trigger) — no new business logic, just the same actions in a cleaner shell.
//
// This is a continuous, mixed-source feed (reviews, mentions, engine pings
// can land any number of times a day) rather than a handful of scheduled
// runs — so unlike Leak Map's audit timeline, there's no calendar/"Today,
// Yesterday" day-bucketing here: just one flat list, newest first, each
// row carrying its own timestamp.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Radar,
  Star,
  MessageSquare,
  AtSign,
  ShieldAlert,
  Loader2,
  ArrowRight,
  RefreshCw,
  PenLine,
  Search,
  Clock,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SentimentPill, FlaggedPill } from "@/app/dashboard/runs/[id]/_shared/sentiment-pill";
import { EmptyState } from "@/app/dashboard/runs/[id]/_shared/empty-state";

type EngineFinding = { id: string; engineId: string; promptText: string; responseText: string; sentiment: string; flagged: boolean; flagReason: string | null; runAt: string };
type TrustpilotReview = { id: string; reviewerName: string | null; rating: number; reviewText: string; sentiment: string; flagged: boolean; flagReason: string | null; createdAt: string };
type RedditMention = { id: string; subreddit: string; author: string | null; permalink: string; mentionText: string; sentiment: string; flagged: boolean; flagReason: string | null; createdAt: string };
type TwitterMention = { id: string; author: string | null; permalink: string; mentionText: string; sentiment: string; flagged: boolean; flagReason: string | null; createdAt: string };
type Incident = { id: string; severityScore: number; summary: string; status: string; declaredAt: string };

type FindingsData = {
  engineFindings: EngineFinding[];
  trustpilotReviews: TrustpilotReview[];
  redditMentions: RedditMention[];
  twitterMentions: TwitterMention[];
  incidents: Incident[];
};

type SourceKind = "engine" | "trustpilot" | "reddit" | "twitter" | "incident";
type SourceFilter = "all" | SourceKind;

type TimelineEntry =
  | { kind: "engine"; id: string; at: string; item: EngineFinding }
  | { kind: "trustpilot"; id: string; at: string; item: TrustpilotReview }
  | { kind: "reddit"; id: string; at: string; item: RedditMention }
  | { kind: "twitter"; id: string; at: string; item: TwitterMention }
  | { kind: "incident"; id: string; at: string; item: Incident };

const SOURCE_META: Record<SourceKind, { label: string; icon: typeof Radar; iconClass: string }> = {
  engine: { label: "AI Engines", icon: Radar, iconClass: "bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300" },
  trustpilot: { label: "Trustpilot", icon: Star, iconClass: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300" },
  reddit: { label: "Reddit", icon: MessageSquare, iconClass: "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300" },
  twitter: { label: "X / Twitter", icon: AtSign, iconClass: "bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300" },
  incident: { label: "Incidents", icon: ShieldAlert, iconClass: "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300" },
};

function entryKey(e: TimelineEntry) {
  return `${e.kind}:${e.id}`;
}

function entryTitle(e: TimelineEntry): string {
  switch (e.kind) {
    case "engine":
      return e.item.engineId;
    case "trustpilot":
      return `${e.item.reviewerName ?? "Anonymous"} · ${e.item.rating}/5`;
    case "reddit":
      return `r/${e.item.subreddit}${e.item.author ? ` · u/${e.item.author}` : ""}`;
    case "twitter":
      return e.item.author ? `@${e.item.author}` : "X mention";
    case "incident":
      return `Severity ${e.item.severityScore}/100`;
  }
}

function entrySnippet(e: TimelineEntry): string {
  switch (e.kind) {
    case "engine":
      return e.item.promptText;
    case "trustpilot":
      return e.item.reviewText;
    case "reddit":
      return e.item.mentionText;
    case "twitter":
      return e.item.mentionText;
    case "incident":
      return e.item.summary;
  }
}

function entrySearchText(e: TimelineEntry): string {
  const base = `${entryTitle(e)} ${entrySnippet(e)}`;
  return e.kind === "engine" ? `${base} ${e.item.responseText}` : base;
}

function entrySentiment(e: TimelineEntry): string | null {
  return e.kind === "incident" ? null : e.item.sentiment;
}

function entryFlagged(e: TimelineEntry): { flagged: boolean; reason: string | null } | null {
  return e.kind === "incident" ? null : { flagged: e.item.flagged, reason: e.item.flagReason };
}

function entryPermalink(e: TimelineEntry): string | null {
  if (e.kind === "reddit" || e.kind === "twitter") return e.item.permalink;
  return null;
}

function entryDraftPlatform(e: TimelineEntry): string | null {
  switch (e.kind) {
    case "engine":
      return "engine_panel";
    case "trustpilot":
      return "trustpilot";
    case "reddit":
      return "reddit";
    case "twitter":
      return "twitter";
    case "incident":
      return null;
  }
}

function buildTimeline(data: FindingsData): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    ...data.engineFindings.map((f) => ({ kind: "engine" as const, id: f.id, at: f.runAt, item: f })),
    ...data.trustpilotReviews.map((r) => ({ kind: "trustpilot" as const, id: r.id, at: r.createdAt, item: r })),
    ...data.redditMentions.map((m) => ({ kind: "reddit" as const, id: m.id, at: m.createdAt, item: m })),
    ...data.twitterMentions.map((m) => ({ kind: "twitter" as const, id: m.id, at: m.createdAt, item: m })),
    ...data.incidents.map((i) => ({ kind: "incident" as const, id: i.id, at: i.declaredAt, item: i })),
  ];
  return entries.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

function formatEntryTime(isoString: string) {
  const d = new Date(isoString);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type TriggerResult = { runId?: string; message?: string; error?: string } | null;

function RunResultBanner({ result }: { result: TriggerResult }) {
  if (!result) return null;
  return (
    <p className={cn("text-[11px] font-mono font-semibold flex items-center justify-between gap-2", result.error ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400")}>
      <span>{result.error ?? result.message}</span>
      {result.runId && (
        <a href={`/dashboard/runs/${result.runId}`} className="underline underline-offset-2 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white font-bold shrink-0">
          View run →
        </a>
      )}
    </p>
  );
}

function useTrigger(engagementId: string) {
  const [state, setState] = useState<"idle" | "running">("idle");
  const [result, setResult] = useState<TriggerResult>(null);

  async function fire(payload: Record<string, unknown>) {
    setState("running");
    setResult(null);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/rep-findings/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      setResult(res.ok ? { runId: body.runId, message: body.message } : { error: body.error ?? "Failed to start." });
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : "Failed to start." });
    } finally {
      setState("idle");
    }
  }

  return { state, result, fire };
}

function DraftResponseButton({ engagementId, findingText, findingPlatform }: { engagementId: string; findingText: string; findingPlatform: string }) {
  const { state, result, fire } = useTrigger(engagementId);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hover-lift press-settle flex items-center gap-1 text-[10.5px] font-mono font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer"
      >
        <PenLine size={11} /> Draft a response
      </button>
    );
  }

  return (
    <div className="space-y-1.5 pt-1">
      {!result && (
        <button
          type="button"
          onClick={() => fire({ action: "draft_response", findingText, findingPlatform })}
          disabled={state === "running"}
          className="hover-lift press-settle shadow-elevation-1 flex items-center gap-1.5 rounded-lg bg-zinc-900 dark:bg-white px-2.5 py-1 text-[10.5px] font-semibold text-white dark:text-zinc-900 hover:opacity-90 disabled:opacity-40 cursor-pointer"
        >
          {state === "running" ? <Loader2 size={11} className="animate-spin" /> : <PenLine size={11} />}
          Confirm — draft a response to this
        </button>
      )}
      <RunResultBanner result={result} />
    </div>
  );
}

/** The one "run a check" control shown at a time — scoped to whichever
 * source tab is active, instead of five always-visible forms. */
function SourceCheckBar({ engagementId, source }: { engagementId: string; source: SourceKind }) {
  const trigger = useTrigger(engagementId);
  const [engineSubject, setEngineSubject] = useState("");
  const [engineQuestion, setEngineQuestion] = useState("");
  const [sinceDate, setSinceDate] = useState("");
  const [redditTimeframe, setRedditTimeframe] = useState("week");
  const [crisisText, setCrisisText] = useState("");
  const [crisisSource, setCrisisSource] = useState("trustpilot");

  return (
    <div className="flex flex-col gap-2 surface-glass-1 rounded-xl p-3">
      {source === "engine" && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <label className="text-[10px] font-mono uppercase text-zinc-500 font-bold block">Subject (optional — competitor)</label>
            <input value={engineSubject} onChange={(e) => setEngineSubject(e.target.value)} placeholder="Client themselves if blank" className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2.5 py-1.5 text-xs w-56" />
          </div>
          <div className="space-y-1 flex-1 min-w-[180px]">
            <label className="text-[10px] font-mono uppercase text-zinc-500 font-bold block">Question (optional)</label>
            <input value={engineQuestion} onChange={(e) => setEngineQuestion(e.target.value)} placeholder="Default: general reputation check" className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2.5 py-1.5 text-xs w-full" />
          </div>
          <button
            type="button"
            onClick={() => trigger.fire({ action: "check_ai_engines", subject: engineSubject.trim() || undefined, question: engineQuestion.trim() || undefined })}
            disabled={trigger.state === "running"}
            className="hover-lift press-settle shadow-elevation-1 flex items-center gap-1.5 rounded-lg bg-zinc-900 dark:bg-white px-3 py-1.5 text-xs font-semibold text-white dark:text-zinc-900 hover:opacity-90 disabled:opacity-40 cursor-pointer"
          >
            {trigger.state === "running" ? <Loader2 size={13} className="animate-spin" /> : <ArrowRight size={13} />}
            Ask now
          </button>
        </div>
      )}

      {(source === "trustpilot" || source === "twitter") && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <label className="text-[10px] font-mono uppercase text-zinc-500 font-bold block">Scan back to</label>
            <input type="date" value={sinceDate} onChange={(e) => setSinceDate(e.target.value)} className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2.5 py-1.5 text-xs" />
          </div>
          <button
            type="button"
            onClick={() => trigger.fire({ action: source === "trustpilot" ? "trustpilot_deep_scan" : "twitter_deep_scan", deepScanSinceDate: sinceDate })}
            disabled={trigger.state === "running" || !sinceDate}
            className="hover-lift press-settle shadow-elevation-1 flex items-center gap-1.5 rounded-lg bg-zinc-900 dark:bg-white px-3 py-1.5 text-xs font-semibold text-white dark:text-zinc-900 hover:opacity-90 disabled:opacity-40 cursor-pointer"
          >
            {trigger.state === "running" ? <Loader2 size={13} className="animate-spin" /> : <ArrowRight size={13} />}
            Deep scan
          </button>
        </div>
      )}

      {source === "reddit" && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <label className="text-[10px] font-mono uppercase text-zinc-500 font-bold block">Widen to timeframe</label>
            <select value={redditTimeframe} onChange={(e) => setRedditTimeframe(e.target.value)} className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2.5 py-1.5 text-xs">
              {["hour", "day", "week", "month", "year", "all"].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => trigger.fire({ action: "reddit_deep_scan", deepScanTimeframe: redditTimeframe })}
            disabled={trigger.state === "running"}
            className="hover-lift press-settle shadow-elevation-1 flex items-center gap-1.5 rounded-lg bg-zinc-900 dark:bg-white px-3 py-1.5 text-xs font-semibold text-white dark:text-zinc-900 hover:opacity-90 disabled:opacity-40 cursor-pointer"
          >
            {trigger.state === "running" ? <Loader2 size={13} className="animate-spin" /> : <ArrowRight size={13} />}
            Widen scan
          </button>
        </div>
      )}

      {source === "incident" && (
        <div className="space-y-1.5">
          <label className="text-[10px] font-mono uppercase text-zinc-500 font-bold block">Test a hypothetical finding against this client&apos;s threshold</label>
          <div className="flex flex-wrap items-end gap-2">
            <input
              value={crisisText}
              onChange={(e) => setCrisisText(e.target.value)}
              placeholder="Made-up finding — e.g. a hypothetical bad review"
              className="flex-1 min-w-[200px] rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2.5 py-1.5 text-xs"
            />
            <select value={crisisSource} onChange={(e) => setCrisisSource(e.target.value)} className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2.5 py-1.5 text-xs">
              {["trustpilot", "reddit", "twitter", "engine_panel"].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => trigger.fire({ action: "check_crisis_threshold", hypotheticalFindingText: crisisText, hypotheticalFindingSource: crisisSource })}
              disabled={trigger.state === "running" || !crisisText.trim()}
              className="hover-lift press-settle shadow-elevation-1 flex items-center gap-1.5 rounded-lg bg-zinc-900 dark:bg-white px-3 py-1.5 text-xs font-semibold text-white dark:text-zinc-900 hover:opacity-90 disabled:opacity-40 cursor-pointer"
            >
              {trigger.state === "running" ? <Loader2 size={13} className="animate-spin" /> : <ArrowRight size={13} />}
              Test threshold
            </button>
          </div>
          <p className="text-[10.5px] text-zinc-500">Hypothetical only — never declares a real incident or notifies anyone.</p>
        </div>
      )}

      <RunResultBanner result={trigger.result} />
    </div>
  );
}

export function RepFindingsPanel({ engagementId }: { engagementId: string }) {
  const [data, setData] = useState<FindingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterText, setFilterText] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/rep-findings`);
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Failed to load findings.");
      setData(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load findings.");
    } finally {
      setLoading(false);
    }
  }, [engagementId]);

  useEffect(() => {
    load();
  }, [load]);

  const timeline = useMemo(() => (data ? buildTimeline(data) : []), [data]);

  const counts = useMemo(() => {
    const c: Record<SourceFilter, number> = { all: timeline.length, engine: 0, trustpilot: 0, reddit: 0, twitter: 0, incident: 0 };
    for (const e of timeline) c[e.kind]++;
    return c;
  }, [timeline]);

  const flaggedCount = useMemo(() => timeline.filter((e) => entryFlagged(e)?.flagged).length, [timeline]);

  const filtered = useMemo(() => {
    let list = timeline;
    if (sourceFilter !== "all") list = list.filter((e) => e.kind === sourceFilter);
    if (filterText.trim()) {
      const q = filterText.trim().toLowerCase();
      list = list.filter((e) => entrySearchText(e).toLowerCase().includes(q));
    }
    return list;
  }, [timeline, sourceFilter, filterText]);

  const selected = useMemo(() => {
    if (selectedKey) {
      const found = filtered.find((e) => entryKey(e) === selectedKey);
      if (found) return found;
    }
    return filtered[0] ?? null;
  }, [filtered, selectedKey]);

  if (loading) {
    return <p className="text-xs text-zinc-500 font-mono py-8 text-center">Loading findings…</p>;
  }

  if (error || !data) {
    return <div className="rounded-xl border border-rose-300 dark:border-rose-800/50 bg-rose-100 dark:bg-rose-950/20 px-3 py-2 text-xs text-rose-800 dark:text-rose-300">{error}</div>;
  }

  return (
    <div className="flex flex-col gap-3 font-sans antialiased">
      {/* Toolbar & Controls — same shell as leak-map-schedule.tsx */}
      <div className="flex flex-wrap items-center justify-between gap-3 surface-glass-1 rounded-2xl p-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-56">
            <Search size={13} className="absolute left-2.5 top-2.5 text-zinc-400 dark:text-zinc-500" />
            <input
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Search findings…"
              className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 py-1.5 pl-8 pr-2.5 text-xs text-zinc-900 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:border-zinc-400 dark:focus:border-zinc-700 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-900 p-0.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-[11px] overflow-x-auto">
            <button
              type="button"
              onClick={() => setSourceFilter("all")}
              className={cn(
                "hover-lift press-settle px-2 py-0.5 rounded-md font-semibold transition-colors cursor-pointer whitespace-nowrap",
                sourceFilter === "all" ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
              )}
            >
              All ({counts.all})
            </button>
            {(Object.keys(SOURCE_META) as SourceKind[]).map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => setSourceFilter(kind)}
                className={cn(
                  "hover-lift press-settle px-2 py-0.5 rounded-md font-semibold transition-colors cursor-pointer whitespace-nowrap",
                  sourceFilter === kind ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
                )}
              >
                {SOURCE_META[kind].label} ({counts[kind]})
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <p className="text-[11px] text-zinc-500 dark:text-zinc-500 font-mono">{flaggedCount} flagged</p>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="hover-lift press-settle shadow-elevation-1 flex items-center gap-1 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer"
          >
            <RefreshCw size={13} className={cn(loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Run a check — only for the source actually being looked at */}
      {sourceFilter !== "all" && <SourceCheckBar engagementId={engagementId} source={sourceFilter} />}

      <div className="space-y-3">
        {/* Timeline feed — full width, flat and newest-first (a continuous
            multi-source feed, not a handful of scheduled runs, so no
            calendar-style day buckets — just a timestamp per row) */}
        <div className="overflow-hidden surface-glass-1 rounded-2xl flex flex-col">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/60">
            <span className="text-xs font-bold text-zinc-900 dark:text-white">Findings Timeline</span>
            <span className="text-[10.5px] font-mono text-zinc-500">{filtered.length} shown</span>
          </div>

          {filtered.length === 0 ? (
            <EmptyState icon={Radar} title="No findings on file" description="Signals will appear here once a watch skill runs on schedule, or run a check above to check right now." />
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800/40 max-h-[420px] overflow-y-auto">
              {filtered.map((e) => {
                const meta = SOURCE_META[e.kind];
                const Icon = meta.icon;
                const isSelected = selected && entryKey(selected) === entryKey(e);
                const flag = entryFlagged(e);
                const sentiment = entrySentiment(e);

                return (
                  <button
                    key={entryKey(e)}
                    type="button"
                    onClick={() => setSelectedKey(entryKey(e))}
                    className={cn(
                      "hover-lift press-settle flex w-full items-center gap-3 px-4 py-3 text-left transition-colors cursor-pointer border-0",
                      isSelected ? "bg-zinc-100/80 dark:bg-zinc-800" : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                    )}
                  >
                    <div className={cn("flex h-7 w-7 items-center justify-center rounded-lg shrink-0", meta.iconClass)}>
                      <Icon size={14} />
                    </div>

                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold text-zinc-900 dark:text-white truncate">{entryTitle(e)}</span>
                        {flag?.flagged && <FlaggedPill flagged reason={flag.reason} />}
                        {sentiment && <SentimentPill sentiment={sentiment} />}
                      </div>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">{entrySnippet(e)}</p>
                    </div>

                    <span className="flex items-center gap-1 text-[10px] font-mono font-bold text-zinc-500 dark:text-zinc-400 shrink-0">
                      <Clock size={9} />
                      {formatEntryTime(e.at)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Diagnostic panel — full detail for whatever's selected */}
        <div className="surface-glass-1 rounded-2xl p-4 space-y-3">
          {selected ? (
            (() => {
              const meta = SOURCE_META[selected.kind];
              const Icon = meta.icon;
              const flag = entryFlagged(selected);
              const sentiment = entrySentiment(selected);
              const permalink = entryPermalink(selected);
              const draftPlatform = entryDraftPlatform(selected);
              const draftText = selected.kind === "engine" ? selected.item.responseText : entrySnippet(selected);

              return (
                <>
                  <div className="flex items-center justify-between flex-wrap gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className={cn("flex h-8 w-8 items-center justify-center rounded-xl shrink-0", meta.iconClass)}>
                        <Icon size={16} />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-zinc-900 dark:text-white">{entryTitle(selected)}</h4>
                        <span className="text-[10.5px] font-mono text-zinc-500">
                          {meta.label} · {new Date(selected.at).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {flag?.flagged && <FlaggedPill flagged reason={flag.reason} />}
                      {sentiment && <SentimentPill sentiment={sentiment} />}
                    </div>
                  </div>

                  {selected.kind === "engine" && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">{selected.item.promptText}</p>
                      <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">{selected.item.responseText}</p>
                    </div>
                  )}
                  {selected.kind !== "engine" && selected.kind !== "incident" && (
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">{entrySnippet(selected)}</p>
                  )}
                  {selected.kind === "incident" && (
                    <div className="space-y-1.5">
                      <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">{selected.item.summary}</p>
                      <p className="text-[10.5px] font-mono text-zinc-500">Status: {selected.item.status}</p>
                    </div>
                  )}

                  {(permalink || draftPlatform) && (
                    <div className="flex items-center gap-3 pt-1">
                      {permalink && (
                        <a href={permalink} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[10.5px] font-mono text-zinc-500 hover:text-zinc-900 dark:hover:text-white underline underline-offset-2">
                          View original <ExternalLink size={10} />
                        </a>
                      )}
                      {draftPlatform && <DraftResponseButton engagementId={engagementId} findingText={draftText} findingPlatform={draftPlatform} />}
                    </div>
                  )}
                </>
              );
            })()
          ) : (
            <div className="py-10 text-center text-zinc-500 space-y-2">
              <Radar size={22} className="mx-auto text-zinc-400 dark:text-zinc-600" />
              <p className="text-xs">Select a finding from the timeline above to inspect it.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
