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
import { PileOnConfigForm } from "@/components/worker-config-forms/pile-on-config-form";
import { renderWorkerConfigForm } from "@/components/worker-config-forms/config-form-registry";
import { WORKER_REGISTRY, type WorkerId } from "@/lib/worker-registry";
import { useToast } from "@/components/toast/toast-provider";

/** Any worker with a config form (config-form-registry.tsx), plus Pile-On,
 * whose small form takes its current values from the page. */
export type ConfigurableSkillId = WorkerId;

export function SkillConfigureMenu({
  skillId,
  engagementId,
  pileOnInitial,
  defaultOpen = false,
}: {
  skillId: ConfigurableSkillId;
  engagementId: string;
  /** Only pile-on needs this — its two config fields live on the
   * engagement's stack, already fetched by whatever server page renders
   * this menu, rather than behind a GET this form would otherwise have to
   * fetch itself the way the other skills' forms do. */
  pileOnInitial?: { smsPlatform: string; adDataPlatform: string };
  /** Open on arrival: the page was reached from a settings link
   * (?configure=1, see workerSettingsHref), not from the skill itself. */
  defaultOpen?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();

  return (
    <FloatingPanel
      align="end"
      defaultOpen={defaultOpen}
      panelWidth={skillId === "pile-on" ? 340 : 560}
      trigger={({ toggle, open }) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-label="Configure"
          title="Configure"
          className="hover-lift press-settle flex items-center justify-center rounded-sm border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 w-8 h-8 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer shrink-0"
        >
          <Settings size={17} />
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
            {skillId === "pile-on" ? (
              <PileOnConfigForm
                engagementId={engagementId}
                initialSmsPlatform={pileOnInitial?.smsPlatform ?? "none"}
                initialAdDataPlatform={pileOnInitial?.adDataPlatform ?? "none"}
                onCancel={close}
                onSaved={savedAndRefresh}
              />
            ) : (
              renderWorkerConfigForm(skillId, { engagementId, onClose: closeAndRefresh, onSaved: savedAndRefresh })
            )}
          </div>
        );
      }}
    </FloatingPanel>
  );
}
