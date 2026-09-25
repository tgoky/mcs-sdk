"use client";

// src/app/dashboard/engagements/[id]/skill-configure-menu.tsx
//
// "Configure" was only reachable from the Library or the Skills panel on
// the main engagement page (bridges/[skill]/page.tsx, a full page nav
// away) — a skill's own dedicated page (skills/[skill]/page.tsx) had no
// way to reach its settings at all. This puts the same config form
// directly on that page instead, via FloatingPanel — the same glassy,
// portaled-to-body treatment ActionMenu uses, but sized and behaved for
// a real form (wider, and doesn't close on internal scroll/resize the
// way ActionMenu does — see floating-panel.tsx's own doc for why that
// matters here specifically).

import { useRouter } from "next/navigation";
import { Settings } from "lucide-react";
import { FloatingPanel } from "@/components/floating-panel";
import { renderWorkerConfigForm } from "@/components/worker-config-forms/config-form-registry";
import { WORKER_REGISTRY, type WorkerId } from "@/lib/worker-registry";
import { useToast } from "@/components/toast/toast-provider";

/** Any worker with a config form (config-form-registry.tsx) — Pile-On
 * included, now that its form is registered there too. */
export type ConfigurableSkillId = WorkerId;

export function SkillConfigureMenu({
  skillId,
  engagementId,
  defaultOpen = false,
  triggerClassName,
  iconSize = 17,
}: {
  skillId: ConfigurableSkillId;
  engagementId: string;
  /** Open on arrival: the page was reached from a settings link
   * (?configure=1, see workerSettingsHref), not from the skill itself. */
  defaultOpen?: boolean;
  /** Overrides the trigger button's own styling — for a caller (the
   * Library's product page) whose row already has a matching icon-button
   * style for its other actions (Analytics, the "..." menu) that this
   * gear should sit flush beside instead of looking like a different
   * control. Defaults to this menu's own look everywhere else. */
  triggerClassName?: string;
  iconSize?: number;
}) {
  const router = useRouter();
  const toast = useToast();

  return (
    <FloatingPanel
      align="end"
      defaultOpen={defaultOpen}
      panelWidth={560}
      trigger={({ toggle, open }) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-label="Configure"
          title="Configure"
          className={
            triggerClassName ??
            "hover-lift press-settle flex items-center justify-center rounded-sm border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 w-8 h-8 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer shrink-0"
          }
        >
          <Settings size={iconSize} />
        </button>
      )}
    >
      {(close) => {
        // Close also refreshes: forms that save in place (and show their
        // own "Saved") are closed with their Cancel/Close button, and the
        // page behind should show what was saved. Only a reported save
        // gets the "saved" toast — Cancel used to show it too.
        const closeAndRefresh = () => {
          close();
          router.refresh();
        };
        const savedAndRefresh = () => {
          closeAndRefresh();
          toast.success(`${WORKER_REGISTRY[skillId].name} configuration saved.`);
        };
        return (
          <div className="p-2.5">
            {renderWorkerConfigForm(skillId, { engagementId, onClose: closeAndRefresh, onSaved: savedAndRefresh })}
          </div>
        );
      }}
    </FloatingPanel>
  );
}
