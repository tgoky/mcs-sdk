"use client";

// src/app/dashboard/engagements/[id]/rep-findings-panel.tsx
//
// The per-engagement Reputation Manager findings page — the bigger gap
// flagged this session: the 6 chat-only adhoc RM actions (live AI-engine
// spot-check, crisis threshold stress-test, draft-response, and 3 deep
// scans) had buttons nowhere to live, because there was no page anywhere
// showing one client's actual Trustpilot reviews, Reddit/Twitter mentions,
// AI-engine findings, or crisis incidents — those existed only per-run
// (/dashboard/runs/[id]) or aggregated across the whole workspace
// (/dashboard/reputation-manager). This is that page's body: one client's
// real history, each section rendered right next to the action that adds
// to it.
//
// Every trigger here calls the same chat-skill-trigger.ts functions
// Teammates chat already uses (via /api/engagements/[id]/rep-findings/
// trigger) — no new business logic, just a second way to reach code
// already shipped and verified this session. Same "dispatch, show a
// runId, link to the run" pattern as trigger-skill-button.tsx and
// run-pin-down-piece-button.tsx; the run link now renders correctly too
// (see adhoc-run-summary-view.tsx — these 6 skill names used to fall
// through to the wrong Pin-Down view).

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Radar, Star, MessageSquare, AtSign, ShieldAlert, Loader2, ArrowRight, RefreshCw, PenLine } from "lucide-react";
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

type TriggerResult = { runId?: string; message?: string; error?: string } | null;

function RunResultBanner({ result }: { result: TriggerResult }) {
  if (!result) return null;
  return (
    <p className={`text-[11px] font-mono font-semibold flex items-center justify-between gap-2 ${result.error ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>
      <span>{result.error ?? result.message}</span>
      {result.runId && (
        <a href={`/dashboard/runs/${result.runId}`} className="underline underline-offset-2 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white font-bold shrink-0">
          View run →
        </a>
      )}
    </p>
  );
}

function SectionCard({ icon: Icon, iconClass, title, count, children }: { icon: React.ElementType; iconClass: string; title: string; count: number; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-[#f8f7fa] dark:bg-zinc-950 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${iconClass}`}>
            <Icon size={16} />
          </div>
          <h3 className="text-sm font-bold text-zinc-900 dark:text-white">{title}</h3>
        </div>
        <span className="text-[11px] font-mono text-zinc-500">{count} on file</span>
      </div>
      {children}
    </div>
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
        className="flex items-center gap-1 text-[10.5px] font-mono font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer"
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
          className="flex items-center gap-1.5 rounded-lg bg-zinc-900 dark:bg-white px-2.5 py-1 text-[10.5px] font-semibold text-white dark:text-zinc-900 hover:opacity-90 disabled:opacity-40 cursor-pointer"
        >
          {state === "running" ? <Loader2 size={11} className="animate-spin" /> : <PenLine size={11} />}
          Confirm — draft a response to this
        </button>
      )}
      <RunResultBanner result={result} />
    </div>
  );
}

export function RepFindingsPanel({ engagementId }: { engagementId: string }) {
  const [data, setData] = useState<FindingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const engineTrigger = useTrigger(engagementId);
  const [engineSubject, setEngineSubject] = useState("");
  const [engineQuestion, setEngineQuestion] = useState("");

  const twitterTrigger = useTrigger(engagementId);
  const [twitterSince, setTwitterSince] = useState("");

  const trustpilotTrigger = useTrigger(engagementId);
  const [trustpilotSince, setTrustpilotSince] = useState("");

  const redditTrigger = useTrigger(engagementId);
  const [redditTimeframe, setRedditTimeframe] = useState("week");

  const crisisTrigger = useTrigger(engagementId);
  const [crisisText, setCrisisText] = useState("");
  const [crisisSource, setCrisisSource] = useState("trustpilot");

  if (loading) {
    return <p className="text-xs text-zinc-500 font-mono py-8 text-center">Loading findings…</p>;
  }

  if (error || !data) {
    return <div className="rounded-xl border border-rose-300 dark:border-rose-800/50 bg-rose-100 dark:bg-rose-950/20 px-3 py-2 text-xs text-rose-800 dark:text-rose-300">{error}</div>;
  }

  return (
    <div className="space-y-4 font-sans antialiased">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={load}
          className="flex items-center gap-1 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer"
        >
          <RefreshCw size={13} />
        </button>
      </div>

      {/* AI ENGINE FINDINGS */}
      <SectionCard icon={Radar} iconClass="bg-violet-200 text-violet-950 dark:bg-violet-900/60 dark:text-violet-200" title="AI Engine Findings" count={data.engineFindings.length}>
        <div className="flex flex-wrap items-end gap-2 pb-2 border-b border-zinc-200 dark:border-zinc-800">
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
            onClick={() => engineTrigger.fire({ action: "check_ai_engines", subject: engineSubject.trim() || undefined, question: engineQuestion.trim() || undefined })}
            disabled={engineTrigger.state === "running"}
            className="flex items-center gap-1.5 rounded-lg bg-zinc-900 dark:bg-white px-3 py-1.5 text-xs font-semibold text-white dark:text-zinc-900 hover:opacity-90 disabled:opacity-40 cursor-pointer"
          >
            {engineTrigger.state === "running" ? <Loader2 size={13} className="animate-spin" /> : <ArrowRight size={13} />}
            Ask now
          </button>
        </div>
        <RunResultBanner result={engineTrigger.result} />

        {data.engineFindings.length === 0 ? (
          <EmptyState icon={Radar} title="No AI engine findings yet" description="Runs once Identity Setup is complete, on schedule — or ask a live question above." />
        ) : (
          <div className="space-y-2">
            {data.engineFindings.map((f) => (
              <div key={f.id} className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-mono font-bold uppercase text-zinc-600 dark:text-zinc-400">{f.engineId}</span>
                  <div className="flex items-center gap-2">
                    <FlaggedPill flagged={f.flagged} reason={f.flagReason} />
                    <SentimentPill sentiment={f.sentiment} />
                  </div>
                </div>
                <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">{f.promptText}</p>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed line-clamp-3">{f.responseText}</p>
                <DraftResponseButton engagementId={engagementId} findingText={f.responseText} findingPlatform="engine_panel" />
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* TRUSTPILOT */}
      <SectionCard icon={Star} iconClass="bg-emerald-200 text-emerald-950 dark:bg-emerald-900/60 dark:text-emerald-200" title="Trustpilot Reviews" count={data.trustpilotReviews.length}>
        <div className="flex flex-wrap items-end gap-2 pb-2 border-b border-zinc-200 dark:border-zinc-800">
          <div className="space-y-1">
            <label className="text-[10px] font-mono uppercase text-zinc-500 font-bold block">Scan back to</label>
            <input type="date" value={trustpilotSince} onChange={(e) => setTrustpilotSince(e.target.value)} className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2.5 py-1.5 text-xs" />
          </div>
          <button
            type="button"
            onClick={() => trustpilotTrigger.fire({ action: "trustpilot_deep_scan", deepScanSinceDate: trustpilotSince })}
            disabled={trustpilotTrigger.state === "running" || !trustpilotSince}
            className="flex items-center gap-1.5 rounded-lg bg-zinc-900 dark:bg-white px-3 py-1.5 text-xs font-semibold text-white dark:text-zinc-900 hover:opacity-90 disabled:opacity-40 cursor-pointer"
          >
            {trustpilotTrigger.state === "running" ? <Loader2 size={13} className="animate-spin" /> : <ArrowRight size={13} />}
            Deep scan
          </button>
        </div>
        <RunResultBanner result={trustpilotTrigger.result} />

        {data.trustpilotReviews.length === 0 ? (
          <EmptyState icon={Star} title="No Trustpilot reviews yet" description="Runs daily on schedule once a domain is set — or scan further back above." />
        ) : (
          <div className="space-y-2">
            {data.trustpilotReviews.map((r) => (
              <div key={r.id} className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-mono font-bold text-zinc-600 dark:text-zinc-400">{r.reviewerName ?? "Anonymous"} — {r.rating}/5</span>
                  <div className="flex items-center gap-2">
                    <FlaggedPill flagged={r.flagged} reason={r.flagReason} />
                    <SentimentPill sentiment={r.sentiment} />
                  </div>
                </div>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed line-clamp-3">{r.reviewText}</p>
                <DraftResponseButton engagementId={engagementId} findingText={r.reviewText} findingPlatform="trustpilot" />
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* REDDIT */}
      <SectionCard icon={MessageSquare} iconClass="bg-orange-200 text-orange-950 dark:bg-orange-900/60 dark:text-orange-200" title="Reddit Mentions" count={data.redditMentions.length}>
        <div className="flex flex-wrap items-end gap-2 pb-2 border-b border-zinc-200 dark:border-zinc-800">
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
            onClick={() => redditTrigger.fire({ action: "reddit_deep_scan", deepScanTimeframe: redditTimeframe })}
            disabled={redditTrigger.state === "running"}
            className="flex items-center gap-1.5 rounded-lg bg-zinc-900 dark:bg-white px-3 py-1.5 text-xs font-semibold text-white dark:text-zinc-900 hover:opacity-90 disabled:opacity-40 cursor-pointer"
          >
            {redditTrigger.state === "running" ? <Loader2 size={13} className="animate-spin" /> : <ArrowRight size={13} />}
            Widen scan
          </button>
        </div>
        <RunResultBanner result={redditTrigger.result} />

        {data.redditMentions.length === 0 ? (
          <EmptyState icon={MessageSquare} title="No Reddit mentions yet" description="Runs daily on schedule — or widen the scan above to reach further back." />
        ) : (
          <div className="space-y-2">
            {data.redditMentions.map((m) => (
              <div key={m.id} className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-mono font-bold text-zinc-600 dark:text-zinc-400">r/{m.subreddit} — {m.author ? `u/${m.author}` : "unknown"}</span>
                  <div className="flex items-center gap-2">
                    <FlaggedPill flagged={m.flagged} reason={m.flagReason} />
                    <SentimentPill sentiment={m.sentiment} />
                  </div>
                </div>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed line-clamp-3">{m.mentionText}</p>
                <div className="flex items-center gap-3">
                  <a href={m.permalink} target="_blank" rel="noreferrer" className="text-[10.5px] font-mono text-zinc-500 hover:text-zinc-900 dark:hover:text-white underline underline-offset-2">
                    View on Reddit
                  </a>
                  <DraftResponseButton engagementId={engagementId} findingText={m.mentionText} findingPlatform="reddit" />
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* TWITTER/X */}
      <SectionCard icon={AtSign} iconClass="bg-sky-200 text-sky-950 dark:bg-sky-900/60 dark:text-sky-200" title="X / Twitter Mentions" count={data.twitterMentions.length}>
        <div className="flex flex-wrap items-end gap-2 pb-2 border-b border-zinc-200 dark:border-zinc-800">
          <div className="space-y-1">
            <label className="text-[10px] font-mono uppercase text-zinc-500 font-bold block">Scan back to</label>
            <input type="date" value={twitterSince} onChange={(e) => setTwitterSince(e.target.value)} className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2.5 py-1.5 text-xs" />
          </div>
          <button
            type="button"
            onClick={() => twitterTrigger.fire({ action: "twitter_deep_scan", deepScanSinceDate: twitterSince })}
            disabled={twitterTrigger.state === "running" || !twitterSince}
            className="flex items-center gap-1.5 rounded-lg bg-zinc-900 dark:bg-white px-3 py-1.5 text-xs font-semibold text-white dark:text-zinc-900 hover:opacity-90 disabled:opacity-40 cursor-pointer"
          >
            {twitterTrigger.state === "running" ? <Loader2 size={13} className="animate-spin" /> : <ArrowRight size={13} />}
            Deep scan
          </button>
        </div>
        <RunResultBanner result={twitterTrigger.result} />

        {data.twitterMentions.length === 0 ? (
          <EmptyState icon={AtSign} title="No X/Twitter mentions yet" description="Runs daily on schedule — or scan further back above." />
        ) : (
          <div className="space-y-2">
            {data.twitterMentions.map((m) => (
              <div key={m.id} className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-mono font-bold text-zinc-600 dark:text-zinc-400">{m.author ? `@${m.author}` : "unknown"}</span>
                  <div className="flex items-center gap-2">
                    <FlaggedPill flagged={m.flagged} reason={m.flagReason} />
                    <SentimentPill sentiment={m.sentiment} />
                  </div>
                </div>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed line-clamp-3">{m.mentionText}</p>
                <div className="flex items-center gap-3">
                  <a href={m.permalink} target="_blank" rel="noreferrer" className="text-[10.5px] font-mono text-zinc-500 hover:text-zinc-900 dark:hover:text-white underline underline-offset-2">
                    View on X
                  </a>
                  <DraftResponseButton engagementId={engagementId} findingText={m.mentionText} findingPlatform="twitter" />
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* CRISIS INCIDENTS */}
      <SectionCard icon={ShieldAlert} iconClass="bg-rose-200 text-rose-950 dark:bg-rose-900/60 dark:text-rose-200" title="Crisis Incidents" count={data.incidents.length}>
        <div className="space-y-2 pb-2 border-b border-zinc-200 dark:border-zinc-800">
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
              onClick={() => crisisTrigger.fire({ action: "check_crisis_threshold", hypotheticalFindingText: crisisText, hypotheticalFindingSource: crisisSource })}
              disabled={crisisTrigger.state === "running" || !crisisText.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-zinc-900 dark:bg-white px-3 py-1.5 text-xs font-semibold text-white dark:text-zinc-900 hover:opacity-90 disabled:opacity-40 cursor-pointer"
            >
              {crisisTrigger.state === "running" ? <Loader2 size={13} className="animate-spin" /> : <ArrowRight size={13} />}
              Test threshold
            </button>
          </div>
          <p className="text-[10.5px] text-zinc-500">Hypothetical only — never declares a real incident or notifies anyone.</p>
        </div>
        <RunResultBanner result={crisisTrigger.result} />

        {data.incidents.length === 0 ? (
          <EmptyState icon={ShieldAlert} title="No incidents declared" description="Crisis Response runs daily on schedule, reading across the other watch skills' flagged findings." />
        ) : (
          <div className="space-y-2">
            {data.incidents.map((inc) => (
              <div key={inc.id} className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-mono font-bold text-rose-600 dark:text-rose-400">Severity {inc.severityScore}/100</span>
                  <span className="text-[10.5px] font-mono text-zinc-500">{inc.status}</span>
                </div>
                <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">{inc.summary}</p>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
