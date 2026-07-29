"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Settings2, ExternalLink, PauseCircle, PlayCircle, Power, Loader2 } from "lucide-react";
import { ActionMenu, ActionMenuSection, ActionMenuDivider, ActionMenuItem } from "@/components/action-menu";
import type { SkillName } from "@/lib/copy";

/**
 * Row-level "Edit settings" menu for every /dashboard/modules/[skill] "By
 * client" table (Pin-Down, Pile-On, Leak-Map, Pre-Call Read, Win-Back all
 * share this one dynamic route, so this one component covers all of them).
 * Pin-Down is a one-time setup skill and isn't toggle-able after the fact
 * (see the API route's own 422 for it), so the enable/disable action only
 * shows for the other skills.
 */
export function ModuleRowActions({
  engagementId,
  buyerName,
  skillId,
  skillLabel,
  skillEnabled,
  pausedAt,
}: {
  engagementId: string;
  buyerName: string;
  skillId: SkillName;
  skillLabel: string;
  skillEnabled: boolean;
  pausedAt: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"toggle" | "pause" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canToggleSkill = skillId !== "pin-down";

  async function toggleSkill(onDone: () => void) {
    setBusy("toggle");
    setError(null);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/skills/${skillId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !skillEnabled }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Failed to update.");
        return;
      }
      router.refresh();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update.");
    } finally {
      setBusy(null);
    }
  }

  async function togglePause(onDone: () => void) {
    setBusy("pause");
    setError(null);
    try {
      const res = pausedAt
        ? await fetch(`/api/engagements/${engagementId}/pause`, { method: "DELETE" })
        : await fetch(`/api/engagements/${engagementId}/pause`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reason: null }),
          });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Failed to update.");
        return;
      }
      router.refresh();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <ActionMenu
      align="end"
      trigger={({ toggle, open }) => (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toggle();
          }}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={`Edit settings for ${buyerName}`}
          className="p-1 rounded-md text-zinc-400 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-colors cursor-pointer"
        >
          <Settings2 className="w-3.5 h-3.5" />
        </button>
      )}
    >
      {(close) => (
        <ActionMenuSection label={buyerName}>
          {canToggleSkill && (
            <ActionMenuItem
              icon={busy === "toggle" ? Loader2 : Power}
              label={skillEnabled ? `Disable ${skillLabel} for this client` : `Enable ${skillLabel} for this client`}
              disabled={busy === "toggle"}
              onClick={() => toggleSkill(close)}
            />
          )}
          <ActionMenuItem
            icon={busy === "pause" ? Loader2 : pausedAt ? PlayCircle : PauseCircle}
            label={pausedAt ? "Resume all automation" : "Pause all automation"}
            description={pausedAt ? undefined : "Stops every module for this client"}
            tone={pausedAt ? "default" : "danger"}
            disabled={busy === "pause"}
            onClick={() => togglePause(close)}
          />
          <ActionMenuDivider />
          <ActionMenuItem icon={ExternalLink} label="Open client page" href={`/dashboard/engagements/${engagementId}`} />
          {error && <p className="px-2.5 pt-1 text-[11px] font-mono text-rose-600 dark:text-rose-400">{error}</p>}
        </ActionMenuSection>
      )}
    </ActionMenu>
  );
}
