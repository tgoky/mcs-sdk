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
import { PinDownConfigForm } from "@/components/worker-config-forms/pin-down-config-form";
import { WinBackConfigForm } from "@/components/worker-config-forms/win-back-config-form";
import { PreCallReadConfigForm } from "@/components/worker-config-forms/pre-call-read-config-form";
import { LeakMapConfigForm } from "@/components/worker-config-forms/leak-map-config-form";
import { PileOnConfigForm } from "@/components/worker-config-forms/pile-on-config-form";

export type ConfigurableSkillId = "pin-down" | "win-back" | "pre-call-read" | "leak-map" | "pile-on";

export function SkillConfigureMenu({
  skillId,
  engagementId,
  pileOnInitial,
}: {
  skillId: ConfigurableSkillId;
  engagementId: string;
  /** Only pile-on needs this — its two config fields live on the
   * engagement's stack, already fetched by whatever server page renders
   * this menu, rather than behind a GET this form would otherwise have to
   * fetch itself the way the other four skills' forms do. */
  pileOnInitial?: { smsPlatform: string; adDataPlatform: string };
}) {
  const router = useRouter();

  return (
    <FloatingPanel
      align="end"
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
        const closeAndRefresh = () => {
          close();
          router.refresh();
        };
        return (
          <div className="p-2.5">
            {skillId === "pin-down" && (
              <PinDownConfigForm engagementId={engagementId} onCancel={close} onSaved={closeAndRefresh} />
            )}
            {skillId === "win-back" && <WinBackConfigForm engagementId={engagementId} onCancel={closeAndRefresh} />}
            {skillId === "pre-call-read" && <PreCallReadConfigForm engagementId={engagementId} onCancel={closeAndRefresh} />}
            {skillId === "leak-map" && <LeakMapConfigForm engagementId={engagementId} onCancel={closeAndRefresh} />}
            {skillId === "pile-on" && (
              <PileOnConfigForm
                engagementId={engagementId}
                initialSmsPlatform={pileOnInitial?.smsPlatform ?? "none"}
                initialAdDataPlatform={pileOnInitial?.adDataPlatform ?? "none"}
                onCancel={close}
                onSaved={closeAndRefresh}
              />
            )}
          </div>
        );
      }}
    </FloatingPanel>
  );
}
