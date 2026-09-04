"use client";

// src/app/dashboard/autopilot/autopilot-table.tsx

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PauseCircle, PlayCircle, Loader2 } from "lucide-react";
import { SKILL_IDS, SKILL_MANIFEST, type SkillId } from "@/lib/skill-manifest";
import { SKILL_INFO, ACTION_TYPE_LABELS } from "@/lib/copy";
import type { PendingActionType } from "@/lib/approval-gate";
import type { AutopilotClientDTO } from "@/lib/autopilot-clients";

export type AutopilotClientRow = AutopilotClientDTO;

const ACTION_TYPES = Object.keys(ACTION_TYPE_LABELS) as PendingActionType[];

/** macOS-style frosted glass toggle switch. */
function ToggleSwitch({ on, busy, onClick, label }: { on: boolean; busy: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={() => !busy && onClick()}
      disabled={busy}
      aria-label={label}
      aria-pressed={on}
      className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer items-center rounded-full transition-all duration-300 ease-out focus:outline-none ${
        on
          ? "bg-amber-400 dark:bg-amber-500 shadow-[0_0_8px_rgba(251,191,36,0.3)]"
          : "bg-zinc-200/80 dark:bg-zinc-700/60 border border-zinc-300/50 dark:border-zinc-600/40 backdrop-blur-sm"
      } ${busy ? "opacity-50" : ""}`}
    >
      <span
        className={`inline-block h-3 w-3 transform rounded-full bg-white shadow-sm transition-transform duration-300 ease-out ${
          on ? "translate-x-[12px]" : "translate-x-[2px]"
        }`}
      />
    </button>
  );
}

export function AutopilotTable({ clients: initialClients }: { clients: AutopilotClientRow[] }) {
  const router = useRouter();
  const [clients, setClients] = useState(initialClients);
  const [busyKeys, setBusyKeys] = useState<Set<string>>(new Set());

  function setBusy(key: string, busy: boolean) {
    setBusyKeys((prev) => {
      const next = new Set(prev);
      if (busy) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function patchClient(engagementId: string, patch: Partial<AutopilotClientRow>) {
    setClients((prev) => prev.map((c) => (c.engagementId === engagementId ? { ...c, ...patch } : c)));
  }

  async function togglePause(row: AutopilotClientRow) {
    const key = `${row.engagementId}:pause`;
    const wasPaused = row.pausedAt !== null;
    const optimisticAt = wasPaused ? null : new Date().toISOString();
    patchClient(row.engagementId, { pausedAt: optimisticAt, pausedReason: wasPaused ? null : row.pausedReason });
    setBusy(key, true);
    try {
      const res = await fetch(`/api/engagements/${row.engagementId}/pause`, { method: wasPaused ? "DELETE" : "POST" });
      if (!res.ok) throw new Error("request failed");
      router.refresh();
    } catch {
      patchClient(row.engagementId, { pausedAt: row.pausedAt, pausedReason: row.pausedReason });
    } finally {
      setBusy(key, false);
    }
  }

  async function patchStack(engagementId: string, stackPatch: Record<string, unknown>) {
    const res = await fetch(`/api/engagements/${engagementId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stack: stackPatch }),
    });
    if (!res.ok) throw new Error("request failed");
  }

  async function toggleApprovalMode(row: AutopilotClientRow) {
    const key = `${row.engagementId}:approval-mode`;
    const nextValue = !row.requireApprovalForSideEffects;
    const previous = { requireApprovalForSideEffects: row.requireApprovalForSideEffects, requireApprovalActionTypes: row.requireApprovalActionTypes };

    patchClient(row.engagementId, {
      requireApprovalForSideEffects: nextValue,
      requireApprovalActionTypes: nextValue ? row.requireApprovalActionTypes : [],
    });
    setBusy(key, true);
    try {
      await patchStack(row.engagementId, {
        require_approval_for_side_effects: nextValue,
        ...(nextValue ? {} : { require_approval_action_types: [] }),
      });
      router.refresh();
    } catch {
      patchClient(row.engagementId, previous);
    } finally {
      setBusy(key, false);
    }
  }

  async function toggleActionTypeScope(row: AutopilotClientRow, actionType: PendingActionType) {
    const key = `${row.engagementId}:scope:${actionType}`;
    const has = row.requireApprovalActionTypes.includes(actionType);
    const nextList = has
      ? row.requireApprovalActionTypes.filter((t) => t !== actionType)
      : [...row.requireApprovalActionTypes, actionType];
    const previous = row.requireApprovalActionTypes;
    patchClient(row.engagementId, { requireApprovalActionTypes: nextList });
    setBusy(key, true);
    try {
      await patchStack(row.engagementId, { require_approval_action_types: nextList });
      router.refresh();
    } catch {
      patchClient(row.engagementId, { requireApprovalActionTypes: previous });
    } finally {
      setBusy(key, false);
    }
  }

  async function toggleSkill(row: AutopilotClientRow, skill: SkillId) {
    const nextEnabled = !row.skills[skill];
    if (nextEnabled && SKILL_MANIFEST[skill].runOnSetup) {
      router.push(`/dashboard/engagements/${row.engagementId}/bridges/${skill}`);
      return;
    }

    const key = `${row.engagementId}:skill:${skill}`;
    const previous = row.skills[skill];
    patchClient(row.engagementId, { skills: { ...row.skills, [skill]: nextEnabled } });
    setBusy(key, true);
    try {
      const res = await fetch(`/api/engagements/${row.engagementId}/skills/${skill}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: nextEnabled }),
      });
      if (!res.ok) throw new Error("request failed");
      router.refresh();
    } catch {
      patchClient(row.engagementId, { skills: { ...row.skills, [skill]: previous } });
    } finally {
      setBusy(key, false);
    }
  }

  return (
    <div className="space-y-2">
      {clients.map((row) => {
        const isPaused = row.pausedAt !== null;
        const pauseBusy = busyKeys.has(`${row.engagementId}:pause`);
        const approvalBusy = busyKeys.has(`${row.engagementId}:approval-mode`);

        return (
          <div
            key={row.engagementId}
            className="rounded-xl p-2.5 space-y-2 bg-white/40 dark:bg-zinc-900/40 backdrop-blur-xl border border-white/60 dark:border-white/10 shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.3)] transition-all"
          >
            {/* Row 1: client name + pause/resume */}
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold truncate text-zinc-900 dark:text-zinc-100 tracking-tight">
                  {row.buyer}
                </p>
                {isPaused && (
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Paused{row.pausedReason ? ` — ${row.pausedReason}` : ""}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => togglePause(row)}
                disabled={pauseBusy}
                className={`flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded-lg backdrop-blur-md border transition-all cursor-pointer disabled:opacity-60 shrink-0 ${
                  isPaused
                    ? "text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/20"
                    : "text-zinc-700 dark:text-zinc-300 bg-zinc-200/50 dark:bg-zinc-800/50 border-zinc-300/40 dark:border-zinc-700/50 hover:bg-zinc-300/50 dark:hover:bg-zinc-700/50"
                }`}
              >
                {pauseBusy ? (
                  <Loader2 size={11} className="animate-spin" />
                ) : isPaused ? (
                  <PlayCircle size={11} />
                ) : (
                  <PauseCircle size={11} />
                )}
                {isPaused ? "Resume" : "Pause"}
              </button>
            </div>

            {/* Row 2: Co-Pilot / Autopilot + scoped action types */}
            <div className="rounded-lg p-2 space-y-1.5 bg-zinc-50/50 dark:bg-zinc-950/30 backdrop-blur-md border border-zinc-200/40 dark:border-white/5">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-zinc-800 dark:text-zinc-200">
                    {row.requireApprovalForSideEffects ? "Co-Pilot" : "Autopilot"}
                  </p>
                  <p className="text-[10px] leading-tight text-zinc-500 dark:text-zinc-400">
                    {row.requireApprovalForSideEffects
                      ? "Side-effectful actions wait for your approval in the Queue first."
                      : "Side-effectful actions run automatically, with no approval step."}
                  </p>
                </div>
                <ToggleSwitch
                  on={row.requireApprovalForSideEffects}
                  busy={approvalBusy}
                  onClick={() => toggleApprovalMode(row)}
                  label={`Toggle Co-Pilot for ${row.buyer}`}
                />
              </div>

              {row.requireApprovalForSideEffects && (
                <div className="flex flex-wrap gap-1 pt-1 border-t border-zinc-200/40 dark:border-white/5">
                  {ACTION_TYPES.map((actionType) => {
                    const selected = row.requireApprovalActionTypes.includes(actionType);
                    const scopeBusy = busyKeys.has(`${row.engagementId}:scope:${actionType}`);
                    return (
                      <button
                        key={actionType}
                        type="button"
                        onClick={() => toggleActionTypeScope(row, actionType)}
                        disabled={scopeBusy}
                        title={ACTION_TYPE_LABELS[actionType]}
                        className={`px-1.5 py-0.5 text-[9px] font-mono font-bold rounded transition-all cursor-pointer disabled:opacity-60 backdrop-blur-sm ${
                          selected
                            ? "bg-amber-400/20 dark:bg-amber-400/10 text-amber-800 dark:text-amber-300 border border-amber-500/40"
                            : "bg-transparent text-zinc-500 dark:text-zinc-400 border border-zinc-300/40 dark:border-white/10 hover:border-zinc-400/50"
                        }`}
                      >
                        {actionType.replace(/_/g, " ")}
                      </button>
                    );
                  })}
                  <span className="text-[9px] text-zinc-400 dark:text-zinc-500 self-center">
                    {row.requireApprovalActionTypes.length === 0 ? "— none picked, so all are gated" : ""}
                  </span>
                </div>
              )}
            </div>

            {/* Row 3: per-skill toggles */}
            <div className="flex flex-wrap gap-1">
              {SKILL_IDS.map((skill) => {
                const enabled = row.skills[skill];
                const skillBusy = busyKeys.has(`${row.engagementId}:skill:${skill}`);
                return (
                  <button
                    key={skill}
                    type="button"
                    onClick={() => !skillBusy && toggleSkill(row, skill)}
                    disabled={skillBusy}
                    title={SKILL_INFO[skill].description}
                    className={`flex items-center gap-1 pl-2 pr-1 py-0.5 text-[9px] font-semibold rounded-full backdrop-blur-sm transition-all cursor-pointer disabled:opacity-60 ${
                      enabled
                        ? "bg-amber-400/15 dark:bg-amber-400/10 text-amber-800 dark:text-amber-300 border border-amber-500/30"
                        : "bg-zinc-100/60 dark:bg-zinc-800/40 text-zinc-600 dark:text-zinc-400 border border-zinc-200/60 dark:border-white/5 hover:border-zinc-300"
                    }`}
                  >
                    {SKILL_INFO[skill].name}
                    <span
                      className={`inline-block w-1 h-1 rounded-full ${enabled ? "bg-amber-500 shadow-[0_0_4px_rgba(245,158,11,0.6)]" : "bg-zinc-400 dark:bg-zinc-600"}`}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}