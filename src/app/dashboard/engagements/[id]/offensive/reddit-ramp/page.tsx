"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Plus, Trash2 } from "lucide-react";
import { OffensiveChecklist } from "@/features/reputation-manager/offensive-checklist";

type Subreddit = { subreddit: string; tier: 1 | 2 | 3 };
type Activity = { occurredAt: string; type: "comment" | "post"; subreddit: string; note: string | null };
type Ramp = {
  confirmedHandle: string | null;
  startedAt: string | null;
  subreddits: Subreddit[];
  activityLog: Activity[];
} | null;

const PHASE_LABELS: Record<string, string> = {
  not_started: "Not started",
  weeks_1_2_foundation: "Weeks 1-2 — comment-only foundation",
  weeks_3_4_unlock: "Weeks 3-4 — self-posts unlocking",
  weeks_5_12_full_cadence: "Weeks 5-12 — full cadence",
  complete: "90-day ramp complete",
};

/**
 * Move C — the 90-day Reddit thread-density ramp. Tracking only: nothing
 * here comments or posts on the operator's behalf (see reddit-ramp.ts).
 */
export default function RedditRampPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [ramp, setRamp] = useState<Ramp>(null);
  const [phase, setPhase] = useState<string>("not_started");
  const [loading, setLoading] = useState(true);

  const [handleInput, setHandleInput] = useState("");
  const [newSubreddit, setNewSubreddit] = useState("");
  const [newTier, setNewTier] = useState<1 | 2 | 3>(1);
  const [newActivity, setNewActivity] = useState({ type: "comment" as "comment" | "post", subreddit: "", note: "" });

  const [karma, setKarma] = useState("");
  const [accountAgeDays, setAccountAgeDays] = useState("");
  const [gateStatus, setGateStatus] = useState<{ visibleToOthers: boolean; selfPostsUnlocked: boolean; linksAllowed: boolean; notes: string[] } | null>(null);

  async function load() {
    const res = await fetch(`/api/engagements/${id}/offensive/reddit-ramp`);
    const data = await res.json();
    if (res.ok) {
      setRamp(data.ramp);
      setPhase(data.phase);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [id]);

  async function confirmHandle() {
    if (!handleInput.trim()) return;
    const res = await fetch(`/api/engagements/${id}/offensive/reddit-ramp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handle: handleInput }),
    });
    if (res.ok) {
      setHandleInput("");
      await load();
    }
  }

  async function addSubreddit() {
    if (!newSubreddit.trim() || !ramp) return;
    const subreddits = [...ramp.subreddits, { subreddit: newSubreddit.trim(), tier: newTier }];
    const res = await fetch(`/api/engagements/${id}/offensive/reddit-ramp/subreddits`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subreddits }),
    });
    if (res.ok) {
      setNewSubreddit("");
      await load();
    }
  }

  async function removeSubreddit(subreddit: string) {
    if (!ramp) return;
    const subreddits = ramp.subreddits.filter((s) => s.subreddit !== subreddit);
    await fetch(`/api/engagements/${id}/offensive/reddit-ramp/subreddits`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subreddits }),
    });
    await load();
  }

  async function logActivity() {
    if (!newActivity.subreddit.trim()) return;
    const res = await fetch(`/api/engagements/${id}/offensive/reddit-ramp/activity`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newActivity),
    });
    if (res.ok) {
      setNewActivity({ type: "comment", subreddit: "", note: "" });
      await load();
    }
  }

  async function checkKarmaGate() {
    const params = new URLSearchParams({ karma: karma || "0", accountAgeDays: accountAgeDays || "0" });
    const res = await fetch(`/api/engagements/${id}/offensive/reddit-ramp/karma-gate?${params}`);
    const data = await res.json();
    if (res.ok) setGateStatus(data.status);
  }

  return (
    <div className="max-w-3xl mx-auto py-12 px-4 space-y-6">
      <button
        onClick={() => router.push(`/dashboard/engagements/${id}/offensive`)}
        className="inline-flex items-center gap-1 text-xs font-mono font-semibold text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors"
      >
        <ChevronLeft size={14} />
        Back to playbook
      </button>

      <div>
        <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Move C — Reddit Ramp</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          A 90-day plan for building real thread density by hand. Tracking only — nothing here posts or comments for you.
        </p>
      </div>

      {loading ? (
        <p className="text-xs text-zinc-400 dark:text-zinc-500 italic font-mono">Loading…</p>
      ) : (
        <>
          <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-white/90 dark:bg-zinc-900/60 p-4 space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider font-mono text-zinc-900 dark:text-zinc-100">Handle & phase</h2>
            {ramp?.confirmedHandle ? (
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">u/{ramp.confirmedHandle}</p>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20">
                  {PHASE_LABELS[phase] ?? phase}
                </span>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  placeholder="Reddit handle (never rename once confirmed)"
                  value={handleInput}
                  onChange={(e) => setHandleInput(e.target.value)}
                  className="flex-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-2 text-xs outline-none focus:border-teal-500"
                />
                <button
                  onClick={confirmHandle}
                  disabled={!handleInput.trim()}
                  className="text-xs font-bold px-3 py-2 rounded-lg bg-zinc-900 text-zinc-50 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 disabled:opacity-40 transition-colors"
                >
                  Confirm & start clock
                </button>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-white/90 dark:bg-zinc-900/60 p-4 space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider font-mono text-zinc-900 dark:text-zinc-100">Subreddit map</h2>
            <div className="flex gap-2">
              <input
                placeholder="subreddit (no r/)"
                value={newSubreddit}
                onChange={(e) => setNewSubreddit(e.target.value)}
                className="flex-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-2 text-xs outline-none focus:border-teal-500"
              />
              <select
                value={newTier}
                onChange={(e) => setNewTier(Number(e.target.value) as 1 | 2 | 3)}
                className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-2 py-2 text-xs outline-none"
              >
                <option value={1}>Tier 1 — comment weekly</option>
                <option value={2}>Tier 2 — comment when relevant</option>
                <option value={3}>Tier 3 — post once track record exists</option>
              </select>
              <button
                onClick={addSubreddit}
                disabled={!newSubreddit.trim()}
                className="text-xs font-bold px-3 rounded-lg bg-zinc-900 text-zinc-50 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 disabled:opacity-40 transition-colors"
              >
                <Plus size={14} />
              </button>
            </div>
            <div className="space-y-1">
              {(ramp?.subreddits ?? []).map((s) => (
                <div key={s.subreddit} className="flex items-center justify-between text-xs py-1 border-b border-zinc-100 dark:border-zinc-800/50 last:border-0">
                  <span className="font-mono text-zinc-700 dark:text-zinc-300">r/{s.subreddit}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500">Tier {s.tier}</span>
                    <button onClick={() => removeSubreddit(s.subreddit)} className="text-zinc-400 hover:text-red-600 dark:hover:text-red-400">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
              {(ramp?.subreddits ?? []).length === 0 && <p className="text-xs text-zinc-400 dark:text-zinc-500 italic">No subreddits mapped yet.</p>}
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-white/90 dark:bg-zinc-900/60 p-4 space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider font-mono text-zinc-900 dark:text-zinc-100">Activity log</h2>
            <div className="flex flex-wrap gap-2">
              <select
                value={newActivity.type}
                onChange={(e) => setNewActivity((a) => ({ ...a, type: e.target.value as "comment" | "post" }))}
                className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-2 py-2 text-xs outline-none"
              >
                <option value="comment">Comment</option>
                <option value="post">Post</option>
              </select>
              <input
                placeholder="subreddit"
                value={newActivity.subreddit}
                onChange={(e) => setNewActivity((a) => ({ ...a, subreddit: e.target.value }))}
                className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-2 text-xs outline-none focus:border-teal-500 w-32"
              />
              <input
                placeholder="note (optional)"
                value={newActivity.note}
                onChange={(e) => setNewActivity((a) => ({ ...a, note: e.target.value }))}
                className="flex-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-2 text-xs outline-none focus:border-teal-500"
              />
              <button
                onClick={logActivity}
                disabled={!newActivity.subreddit.trim()}
                className="text-xs font-bold px-3 rounded-lg bg-zinc-900 text-zinc-50 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 disabled:opacity-40 transition-colors"
              >
                Log
              </button>
            </div>
            <div className="space-y-0.5 max-h-48 overflow-y-auto">
              {(ramp?.activityLog ?? [])
                .slice()
                .reverse()
                .map((a, i) => (
                  <div key={i} className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
                    {new Date(a.occurredAt).toLocaleDateString()} — {a.type} in r/{a.subreddit}
                    {a.note ? `: ${a.note}` : ""}
                  </div>
                ))}
              {(ramp?.activityLog ?? []).length === 0 && <p className="text-xs text-zinc-400 dark:text-zinc-500 italic">No activity logged yet.</p>}
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-white/90 dark:bg-zinc-900/60 p-4 space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider font-mono text-zinc-900 dark:text-zinc-100">Karma gate check</h2>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Enter what Reddit currently shows for this account — not fetched automatically.</p>
            <div className="flex gap-2">
              <input
                placeholder="Karma"
                type="number"
                value={karma}
                onChange={(e) => setKarma(e.target.value)}
                className="w-28 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-2 text-xs outline-none focus:border-teal-500"
              />
              <input
                placeholder="Account age (days)"
                type="number"
                value={accountAgeDays}
                onChange={(e) => setAccountAgeDays(e.target.value)}
                className="w-36 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-2 text-xs outline-none focus:border-teal-500"
              />
              <button
                onClick={checkKarmaGate}
                className="text-xs font-bold px-3 rounded-lg bg-zinc-900 text-zinc-50 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
              >
                Check
              </button>
            </div>
            {gateStatus && (
              <ul className="text-[11px] text-zinc-500 dark:text-zinc-400 space-y-0.5 list-disc list-inside">
                {gateStatus.notes.length === 0 ? <li>Every gate is clear.</li> : gateStatus.notes.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            )}
          </section>
        </>
      )}

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-white/90 dark:bg-zinc-900/60 p-4">
        <h2 className="text-xs font-bold uppercase tracking-wider font-mono text-zinc-900 dark:text-zinc-100 mb-2">Checklist</h2>
        <OffensiveChecklist engagementId={id} move="c" />
      </section>
    </div>
  );
}
