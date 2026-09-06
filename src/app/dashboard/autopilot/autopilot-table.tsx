"use client";

// src/app/dashboard/autopilot/autopilot-table.tsx

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PauseCircle, PlayCircle, Loader2, ChevronDown, SlidersHorizontal } from "lucide-react";
import { SKILL_IDS, SKILL_MANIFEST, type SkillId } from "@/lib/skill-manifest";
import { REP_SKILL_IDS, REP_SKILL_MANIFEST, type RepSkillId } from "@/lib/rep-skill-manifest";
import { SKILL_INFO, ACTION_TYPE_LABELS } from "@/lib/copy";
import type { PendingActionType } from "@/lib/approval-gate";
import type { AutopilotClientDTO } from "@/lib/autopilot-clients";

export type AutopilotClientRow = AutopilotClientDTO;

const ACTION_TYPES = Object.keys(ACTION_TYPE_LABELS) as PendingActionType[];

function ToggleSwitch({ on, busy, onClick, label }: { on: boolean; busy: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={() => !busy && onClick()}
      disabled={busy}
      aria-label={label}
      aria-pressed={on}
      className={`relative inline-flex h-3.5 w-6 shrink-0 cursor-pointer items-center rounded-full transition-all duration-200 focus:outline-none ${
        on
          ? "bg-amber-400 dark:bg-amber-500 shadow-[0_0_6px_rgba(251,191,36,0.3)]"
          : "bg-zinc-300 dark:bg-zinc-700/80 border border-zinc-400/30 dark:border-zinc-600/50"
      } ${busy ? "opacity-50" : ""}`}
    >
      <span
        className={`inline-block h-2.5 w-2.5 transform rounded-full bg-white shadow-xs transition-transform duration-200 ${
          on ? "translate-x-[11px]" : "translate-x-[1px]"
        }`}
      />
    </button>
  );
}

export function AutopilotTable({ clients: initialClients }: { clients: AutopilotClientRow[] }) {
  const router = useRouter();
  const [clients, setClients] = useState(initialClients);
  const [busyKeys, setBusyKeys] = useState<Set<string>>(new Set());
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());

  function toggleExpanded(id: string) {
    setExpandedClients((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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

  async function toggleShowtimeSkill(row: AutopilotClientRow, skill: SkillId) {
    const nextEnabled = !row.showtimeSkills[skill];
    if (nextEnabled && SKILL_MANIFEST[skill].runOnSetup) {
      router.push(`/dashboard/engagements/${row.engagementId}/bridges/${skill}`);
      return;
    }

    const key = `${row.engagementId}:skill:${skill}`;
    const previous = row.showtimeSkills[skill];
    patchClient(row.engagementId, { showtimeSkills: { ...row.showtimeSkills, [skill]: nextEnabled } });
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
      patchClient(row.engagementId, { showtimeSkills: { ...row.showtimeSkills, [skill]: previous } });
    } finally {
      setBusy(key, false);
    }
  }

  async function toggleRepSkill(row: AutopilotClientRow, skill: RepSkillId) {
    const nextEnabled = !row.repSkills[skill];
    if (nextEnabled && REP_SKILL_MANIFEST[skill].runOnSetup) {
      router.push(`/dashboard/engagements/${row.engagementId}/bridges/${skill}`);
      return;
    }

    const key = `${row.engagementId}:rep-skill:${skill}`;
    const previous = row.repSkills[skill];
    patchClient(row.engagementId, { repSkills: { ...row.repSkills, [skill]: nextEnabled } });
    setBusy(key, true);
    try {
      const res = await fetch(`/api/engagements/${row.engagementId}/skills/rep/${skill}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: nextEnabled }),
      });
      if (!res.ok) throw new Error("request failed");
      router.refresh();
    } catch {
      patchClient(row.engagementId, { repSkills: { ...row.repSkills, [skill]: previous } });
    } finally {
      setBusy(key, false);
    }
  }

  return (
    <div className="space-y-1.5 p-1">
      {clients.map((row) => {
        const isPaused = row.pausedAt !== null;
        const pauseBusy = busyKeys.has(`${row.engagementId}:pause`);
        const approvalBusy = busyKeys.has(`${row.engagementId}:approval-mode`);
        const isExpanded = expandedClients.has(row.engagementId);

        // Combined across whichever product(s) this client is actually
        // enrolled in — a pure-RM client used to be measured against
        // Showtime's 5 regardless (and vice versa), which is exactly the
        // "5 chips that never applied to them" problem this file existed
        // to fix. Neither set counts at all unless that product is
        // actually configured for this client.
        const showtimeEnabledCount = row.showtimeConfigured ? Object.values(row.showtimeSkills).filter(Boolean).length : 0;
        const repEnabledCount = row.repConfigured ? Object.values(row.repSkills).filter(Boolean).length : 0;
        const totalSkillCount = (row.showtimeConfigured ? SKILL_IDS.length : 0) + (row.repConfigured ? REP_SKILL_IDS.length : 0);
        const enabledSkillsCount = showtimeEnabledCount + repEnabledCount;
        const gatedActionsCount = row.requireApprovalActionTypes.length;

        return (
          <div
            key={row.engagementId}
            className="rounded-lg bg-white/50 dark:bg-zinc-900/50 backdrop-blur-md border border-zinc-200/70 dark:border-white/5 transition-all"
          >
            {/* Main compact row */}
            <div className="flex items-center justify-between gap-2 px-2.5 py-2">
              <div className="min-w-0 flex-1 flex items-center gap-2">
                <p className="text-xs font-semibold truncate text-zinc-900 dark:text-zinc-100">
                  {row.buyer}
                </p>
                {isPaused && (
                  <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-zinc-200/60 dark:bg-zinc-800 text-zinc-500">
                    Paused
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {/* Mode toggle with tooltip */}
                <div
                  className="flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-zinc-100/80 dark:bg-zinc-800/50 border border-zinc-200/50 dark:border-white/5"
                  title={
                    row.requireApprovalForSideEffects
                      ? "Co-Pilot: Actions wait for approval"
                      : "Autopilot: Actions execute automatically"
                  }
                >
                  <span className="text-[10px] font-medium text-zinc-600 dark:text-zinc-300">
                    {row.requireApprovalForSideEffects ? "Co-Pilot" : "Autopilot"}
                  </span>
                  <ToggleSwitch
                    on={row.requireApprovalForSideEffects}
                    busy={approvalBusy}
                    onClick={() => toggleApprovalMode(row)}
                    label={`Toggle mode for ${row.buyer}`}
                  />
                </div>

                {/* Pause/Resume Button */}
                <button
                  type="button"
                  onClick={() => togglePause(row)}
                  disabled={pauseBusy}
                  className="p-1 rounded text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200/50 dark:hover:bg-zinc-800 transition-colors"
                  title={isPaused ? "Resume client" : "Pause client"}
                >
                  {pauseBusy ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : isPaused ? (
                    <PlayCircle size={13} className="text-emerald-500" />
                  ) : (
                    <PauseCircle size={13} />
                  )}
                </button>

                {/* Expand / Configure Drawer Trigger */}
                <button
                  type="button"
                  onClick={() => toggleExpanded(row.engagementId)}
                  className={`p-1 rounded text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-transform ${
                    isExpanded ? "rotate-180 bg-zinc-200/50 dark:bg-zinc-800" : ""
                  }`}
                  title="Configure skills and gates"
                >
                  <ChevronDown size={13} />
                </button>
              </div>
            </div>

            {/* Quick Summary Strip (When collapsed) */}
            {!isExpanded && (
              <div
                onClick={() => toggleExpanded(row.engagementId)}
                className="flex items-center justify-between px-2.5 pb-2 text-[10px] text-zinc-400 dark:text-zinc-500 cursor-pointer hover:text-zinc-600 dark:hover:text-zinc-400 transition-colors"
              >
                <span>{enabledSkillsCount} of {totalSkillCount} skills active</span>
                {row.requireApprovalForSideEffects && (
                  <span>{gatedActionsCount === 0 ? "All actions gated" : `${gatedActionsCount} gated`}</span>
                )}
              </div>
            )}

            {/* Expanded Detailed Configuration */}
            {isExpanded && (
              <div className="px-2.5 pb-2.5 pt-1 space-y-2 border-t border-zinc-200/40 dark:border-white/5">
                {/* Action Gate Scopes */}
                {row.requireApprovalForSideEffects && (
                  <div className="space-y-1">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">
                      Require Approval For:
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {ACTION_TYPES.map((actionType) => {
                        const selected = row.requireApprovalActionTypes.includes(actionType);
                        const scopeBusy = busyKeys.has(`${row.engagementId}:scope:${actionType}`);
                        return (
                          <button
                            key={actionType}
                            type="button"
                            onClick={() => toggleActionTypeScope(row, actionType)}
                            disabled={scopeBusy}
                            className={`px-1.5 py-0.5 text-[9px] font-mono rounded transition-colors ${
                              selected
                                ? "bg-amber-400/20 text-amber-800 dark:text-amber-300 border border-amber-500/40"
                                : "bg-zinc-100 dark:bg-zinc-800/40 text-zinc-500 border border-zinc-200/60 dark:border-white/5"
                            }`}
                          >
                            {actionType.replace(/_/g, " ")}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Showtime Skill Toggles */}
                {row.showtimeConfigured && (
                  <div className="space-y-1">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">
                      Showtime Skills:
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {SKILL_IDS.map((skill) => {
                        const enabled = row.showtimeSkills[skill];
                        const skillBusy = busyKeys.has(`${row.engagementId}:skill:${skill}`);
                        return (
                          <button
                            key={skill}
                            type="button"
                            onClick={() => !skillBusy && toggleShowtimeSkill(row, skill)}
                            disabled={skillBusy}
                            title={SKILL_INFO[skill].description}
                            className={`flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-medium rounded-full transition-colors ${
                              enabled
                                ? "bg-amber-400/15 text-amber-800 dark:text-amber-300 border border-amber-500/30"
                                : "bg-zinc-100/80 dark:bg-zinc-800/30 text-zinc-400 border border-zinc-200/50 dark:border-white/5"
                            }`}
                          >
                            {SKILL_INFO[skill].name}
                            <span
                              className={`w-1 h-1 rounded-full ${
                                enabled ? "bg-amber-500" : "bg-zinc-300 dark:bg-zinc-600"
                              }`}
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Reputation Manager Skill Toggles */}
                {row.repConfigured && (
                  <div className="space-y-1">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">
                      Reputation Manager Capabilities:
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {REP_SKILL_IDS.map((skill) => {
                        const enabled = row.repSkills[skill];
                        const skillBusy = busyKeys.has(`${row.engagementId}:rep-skill:${skill}`);
                        return (
                          <button
                            key={skill}
                            type="button"
                            onClick={() => !skillBusy && toggleRepSkill(row, skill)}
                            disabled={skillBusy}
                            title={REP_SKILL_MANIFEST[skill].description}
                            className={`flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-medium rounded-full transition-colors ${
                              enabled
                                ? "bg-violet-400/15 text-violet-800 dark:text-violet-300 border border-violet-500/30"
                                : "bg-zinc-100/80 dark:bg-zinc-800/30 text-zinc-400 border border-zinc-200/50 dark:border-white/5"
                            }`}
                          >
                            {REP_SKILL_MANIFEST[skill].name}
                            <span
                              className={`w-1 h-1 rounded-full ${
                                enabled ? "bg-violet-500" : "bg-zinc-300 dark:bg-zinc-600"
                              }`}
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {!row.showtimeConfigured && !row.repConfigured && (
                  <p className="text-[9px] text-zinc-400 dark:text-zinc-600 italic">
                    Not set up under Showtime or Reputation Manager yet — nothing to control here.
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
