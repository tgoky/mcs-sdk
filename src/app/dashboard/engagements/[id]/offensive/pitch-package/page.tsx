"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Plus, Trash2, Sparkles, Copy, Check } from "lucide-react";
import { OffensiveChecklist } from "@/features/reputation-manager/offensive-checklist";

type PitchHistoryEntry = { type: string; note: string | null; occurredAt: string };
type PitchTarget = {
  id: string;
  target: string;
  beat: string | null;
  contact: string | null;
  channel: string | null;
  fitNotes: string | null;
  status: string;
  history: PitchHistoryEntry[];
};

const STATUS_LABELS: Record<string, string> = {
  not_contacted: "Not contacted",
  sent: "Sent",
  followed_up: "Followed up",
  replied: "Replied",
  placed: "Placed",
  declined: "Declined",
};

const ARCHETYPES = [
  { id: "systems", label: "Systems" },
  { id: "contrarian", label: "Contrarian" },
  { id: "data", label: "Data" },
] as const;

/**
 * Move B — Tier-1 target list, pitch drafting, and outreach tracking.
 * Drafts are generated for the operator to personalize and send from
 * their own email; nothing here sends anything (see pitch-package.ts).
 */
export default function PitchPackagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [targets, setTargets] = useState<PitchTarget[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newTarget, setNewTarget] = useState({ target: "", beat: "", contact: "", channel: "", fitNotes: "" });
  const [adding, setAdding] = useState(false);

  const [draftingFor, setDraftingFor] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { subject: string; body: string }>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/engagements/${id}/offensive/pitch-targets`);
    const data = await res.json();
    if (res.ok) setTargets(data.targets);
    else setError(data.error ?? "Failed to load");
  }

  useEffect(() => {
    load();
  }, [id]);

  async function addTarget() {
    if (!newTarget.target.trim()) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/engagements/${id}/offensive/pitch-targets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newTarget),
      });
      if (res.ok) {
        setNewTarget({ target: "", beat: "", contact: "", channel: "", fitNotes: "" });
        await load();
      }
    } finally {
      setAdding(false);
    }
  }

  async function removeTarget(targetId: string) {
    await fetch(`/api/engagements/${id}/offensive/pitch-targets/${targetId}`, { method: "DELETE" });
    await load();
  }

  async function logEvent(targetId: string, type: PitchHistoryEntry["type"]) {
    await fetch(`/api/engagements/${id}/offensive/pitch-targets/${targetId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type }),
    });
    await load();
  }

  async function draftFor(targetId: string, archetype: string) {
    setDraftingFor(targetId);
    try {
      const res = await fetch(`/api/engagements/${id}/offensive/pitch-targets/${targetId}/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archetype }),
      });
      const data = await res.json();
      if (res.ok) setDrafts((prev) => ({ ...prev, [targetId]: data.draft }));
    } finally {
      setDraftingFor(null);
    }
  }

  async function copyDraft(targetId: string) {
    const d = drafts[targetId];
    if (!d) return;
    await navigator.clipboard.writeText(`Subject: ${d.subject}\n\n${d.body}`);
    setCopiedId(targetId);
    setTimeout(() => setCopiedId(null), 1500);
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
        <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Move B — Press Outreach</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          Tier-1 targets, drafted pitches, and outreach tracking. Every send happens from your own email — this only drafts and tracks.
        </p>
      </div>

      {error && <p className="text-xs text-red-600 dark:text-red-400 font-mono">{error}</p>}

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-white/90 dark:bg-zinc-900/60 p-4 space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider font-mono text-zinc-900 dark:text-zinc-100">Add a target</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <input
            placeholder="Publication / newsletter / podcast"
            value={newTarget.target}
            onChange={(e) => setNewTarget((t) => ({ ...t, target: e.target.value }))}
            className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-2 text-xs outline-none focus:border-teal-500"
          />
          <input
            placeholder="Beat"
            value={newTarget.beat}
            onChange={(e) => setNewTarget((t) => ({ ...t, beat: e.target.value }))}
            className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-2 text-xs outline-none focus:border-teal-500"
          />
          <input
            placeholder="Contact"
            value={newTarget.contact}
            onChange={(e) => setNewTarget((t) => ({ ...t, contact: e.target.value }))}
            className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-2 text-xs outline-none focus:border-teal-500"
          />
          <input
            placeholder="Channel (email, DM, etc.)"
            value={newTarget.channel}
            onChange={(e) => setNewTarget((t) => ({ ...t, channel: e.target.value }))}
            className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-2 text-xs outline-none focus:border-teal-500"
          />
          <input
            placeholder="Why this target fits"
            value={newTarget.fitNotes}
            onChange={(e) => setNewTarget((t) => ({ ...t, fitNotes: e.target.value }))}
            className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-2 text-xs outline-none focus:border-teal-500 sm:col-span-2"
          />
        </div>
        <button
          onClick={addTarget}
          disabled={adding || !newTarget.target.trim()}
          className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-zinc-900 text-zinc-50 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 disabled:opacity-40 transition-colors"
        >
          <Plus size={13} />
          Add target
        </button>
      </section>

      <section className="space-y-3">
        {targets === null ? (
          <p className="text-xs text-zinc-400 dark:text-zinc-500 italic font-mono">Loading…</p>
        ) : targets.length === 0 ? (
          <p className="text-xs text-zinc-400 dark:text-zinc-500 italic font-mono">No targets yet.</p>
        ) : (
          targets.map((t) => (
            <div key={t.id} className="rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-white/90 dark:bg-zinc-900/60 p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{t.target}</h3>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    {[t.beat, t.contact, t.channel].filter(Boolean).join(" · ") || "No details yet"}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                    {STATUS_LABELS[t.status] ?? t.status}
                  </span>
                  <button onClick={() => removeTarget(t.id)} className="text-zinc-400 hover:text-red-600 dark:hover:text-red-400 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {t.fitNotes && <p className="text-[11px] text-zinc-500 dark:text-zinc-400 italic">{t.fitNotes}</p>}

              <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-zinc-100 dark:border-zinc-800/60">
                {ARCHETYPES.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => draftFor(t.id, a.id)}
                    disabled={draftingFor === t.id}
                    className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold px-2 py-1 rounded-md border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors"
                  >
                    <Sparkles size={11} />
                    {draftingFor === t.id ? "Drafting…" : `Draft (${a.label})`}
                  </button>
                ))}
                <span className="mx-1 text-zinc-300 dark:text-zinc-700">|</span>
                {(["sent", "follow_up", "reply", "placement", "declined"] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => logEvent(t.id, type)}
                    className="text-[11px] font-mono text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 underline decoration-dotted transition-colors"
                  >
                    log {type.replace("_", " ")}
                  </button>
                ))}
              </div>

              {drafts[t.id] && (
                <div className="rounded-lg bg-zinc-50 dark:bg-zinc-950 p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-mono font-bold text-zinc-500 dark:text-zinc-400">Subject: {drafts[t.id].subject}</p>
                    <button
                      onClick={() => copyDraft(t.id)}
                      className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                    >
                      {copiedId === t.id ? <Check size={11} /> : <Copy size={11} />}
                      {copiedId === t.id ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <p className="text-xs text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">{drafts[t.id].body}</p>
                </div>
              )}

              {t.history.length > 0 && (
                <div className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500 space-y-0.5 pt-1">
                  {t.history.map((h, i) => (
                    <div key={i}>
                      {new Date(h.occurredAt).toLocaleDateString()} — {h.type.replace("_", " ")}
                      {h.note ? `: ${h.note}` : ""}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </section>

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-white/90 dark:bg-zinc-900/60 p-4">
        <h2 className="text-xs font-bold uppercase tracking-wider font-mono text-zinc-900 dark:text-zinc-100 mb-2">Checklist</h2>
        <OffensiveChecklist engagementId={id} move="b" />
      </section>
    </div>
  );
}
