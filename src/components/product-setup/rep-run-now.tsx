"use client";

// src/components/product-setup/rep-run-now.tsx
//
// The one-off action a watch supports beyond its schedule, shown under that
// watch's own settings: ask the AI engines now, or look further back on
// Trustpilot, Reddit or X than the daily watch does. It isn't a setting,
// so it has its own button instead of riding the settings' Save. Posts to
// rep-findings/trigger, the same trigger Teammates chat uses.

import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { Labeled, inputCls } from "./review-kit";

export const REP_RUN_NOW_SKILLS = ["rep-engine-panel", "rep-trustpilot-watch", "rep-reddit-watch", "rep-twitter-watch"] as const;
type RunNowSkill = (typeof REP_RUN_NOW_SKILLS)[number];

export function hasRepRunNow(skill: string | undefined): skill is RunNowSkill {
  return (REP_RUN_NOW_SKILLS as readonly string[]).includes(skill ?? "");
}

const REDDIT_TIMEFRAMES = [
  { value: "day", label: "The past day" },
  { value: "week", label: "The past week" },
  { value: "month", label: "The past month" },
  { value: "year", label: "The past year" },
  { value: "all", label: "All time" },
];

const COPY: Record<RunNowSkill, { title: string; about: string; button: string }> = {
  "rep-engine-panel": {
    title: "Ask the AI engines now",
    about: "Asks every engine switched on right away, instead of waiting for the schedule. Leave both blank for the usual reputation check.",
    button: "Ask now",
  },
  "rep-trustpilot-watch": {
    title: "Look further back on Trustpilot",
    about: "The daily watch picks up new reviews. This pulls every review since a date you choose and scores anything it hasn't seen.",
    button: "Look back",
  },
  "rep-reddit-watch": {
    title: "Widen the Reddit search",
    about: "The daily watch searches the newest posts. This also searches the top posts over a longer window and adds anything new.",
    button: "Widen the search",
  },
  "rep-twitter-watch": {
    title: "Look further back on X",
    about: "The daily watch picks up new posts. This pulls every matching post since a date you choose and scores anything it hasn't seen.",
    button: "Look back",
  },
};

export function RepRunNow({ engagementId, skill }: { engagementId: string; skill: RunNowSkill }) {
  const today = new Date().toISOString().slice(0, 10);
  const [since, setSince] = useState("");
  const [timeframe, setTimeframe] = useState("month");
  const [subject, setSubject] = useState("");
  const [question, setQuestion] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState<{ runId: string | null; message: string } | null>(null);
  const copy = COPY[skill];
  const needsDate = skill === "rep-trustpilot-watch" || skill === "rep-twitter-watch";
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(since) && since <= today;

  async function run() {
    setRunning(true);
    setError(null);
    setStarted(null);
    const body =
      skill === "rep-engine-panel"
        ? { action: "check_ai_engines", subject: subject.trim() || undefined, question: question.trim() || undefined }
        : skill === "rep-reddit-watch"
          ? { action: "reddit_deep_scan", deepScanTimeframe: timeframe }
          : { action: skill === "rep-trustpilot-watch" ? "trustpilot_deep_scan" : "twitter_deep_scan", deepScanSinceDate: since };
    try {
      const res = await fetch(`/api/engagements/${engagementId}/rep-findings/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't start it.");
      setStarted({ runId: data.runId ?? null, message: data.message ?? "Started." });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start it.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="space-y-3 border-t border-[var(--border)] px-1 pt-5">
      <div>
        <h2 className="text-[14px] font-medium text-[var(--text-primary)]">{copy.title}</h2>
        <p className="mt-0.5 text-[13px] leading-relaxed text-[var(--text-secondary)]">{copy.about}</p>
      </div>
      {skill === "rep-engine-panel" && (
        <div className="grid gap-3 @md:grid-cols-2">
          <Labeled label="About (optional)">
            <input aria-label="About" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="The business name" className={`${inputCls} h-9`} />
          </Labeled>
          <Labeled label="Question (optional)">
            <input aria-label="Question" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Is this business legit?" className={`${inputCls} h-9`} />
          </Labeled>
        </div>
      )}
      {needsDate && (
        <Labeled label="Since">
          <input aria-label="Since" type="date" max={today} value={since} onChange={(e) => setSince(e.target.value)} className={`${inputCls} h-9 w-48`} />
        </Labeled>
      )}
      {skill === "rep-reddit-watch" && (
        <Labeled label="Over">
          <select aria-label="Over" value={timeframe} onChange={(e) => setTimeframe(e.target.value)} className={`${inputCls} h-9 w-48`}>
            {REDDIT_TIMEFRAMES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Labeled>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={run}
          disabled={running || (needsDate && !dateOk)}
          className="h-9 rounded-lg border border-[var(--border)] px-3 text-[13px] font-medium text-[var(--text-primary)] hover:bg-[var(--accent-dim)] disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
        >
          {running ? "Starting…" : copy.button}
        </button>
        {started && (
          <p className="flex items-center gap-2 text-[13px] text-[var(--text-secondary)]">
            {started.message}
            {started.runId && (
              <a href={`/dashboard/runs/${started.runId}`} className="inline-flex items-center gap-1 underline underline-offset-4 hover:text-[var(--text-primary)]">
                Follow it <ArrowUpRight className="h-3 w-3" />
              </a>
            )}
          </p>
        )}
        {error && <p className="text-[13px] text-[var(--error)]">{error}</p>}
      </div>
    </section>
  );
}
