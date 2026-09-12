"use client";

// src/app/dashboard/engagements/[id]/skill-configure-menu.tsx
//
// "Configure" was only reachable from the Library or the Skills panel on
// the main engagement page (bridges/[skill]/page.tsx, a full page nav
// away) — a skill's own dedicated page (skills/[skill]/page.tsx) had no
// way to reach its settings at all. This puts the same config form
// directly on that page instead, via the same glassy, portaled-to-body
// overlay ActionMenu already uses elsewhere (action-menu.tsx) — it opens
// over the current page rather than navigating away, and closes back to
// exactly where you were.

import { useRouter } from "next/navigation";
import { Settings } from "lucide-react";
import { ActionMenu } from "@/components/action-menu";
import { PinDownConfigForm } from "@/components/worker-config-forms/pin-down-config-form";
import { WinBackConfigForm } from "@/components/worker-config-forms/win-back-config-form";
import { PreCallReadConfigForm } from "@/components/worker-config-forms/pre-call-read-config-form";
import { LeakMapConfigForm } from "@/components/worker-config-forms/leak-map-config-form";

export type ConfigurableSkillId = "pin-down" | "win-back" | "pre-call-read" | "leak-map";

export function SkillConfigureMenu({ skillId, engagementId }: { skillId: ConfigurableSkillId; engagementId: string }) {
  const router = useRouter();

  return (
    <ActionMenu
      align="end"
      panelWidth={440}
      trigger={({ toggle, open }) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="hover-lift press-settle flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer shrink-0"
        >
          <Settings size={13} />
          Configure
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
          </div>
        );
      }}
    </ActionMenu>
  );
}
