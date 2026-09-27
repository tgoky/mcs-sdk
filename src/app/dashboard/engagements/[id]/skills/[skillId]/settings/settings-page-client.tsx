"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { SkillSettingsPanel } from "@/components/skill-settings/skill-settings-panel";
import { useToast } from "@/components/toast/toast-provider";
import { WORKER_REGISTRY, type WorkerId } from "@/lib/worker-registry";

export function SkillSettingsPageClient({ engagementId, skillId, backHref }: { engagementId: string; skillId: WorkerId; backHref: string }) {
  const router = useRouter();
  const toast = useToast();
  const name = WORKER_REGISTRY[skillId].name;

  // Back from signing in to a tool: say how it went, and clean the address bar.
  useEffect(() => {
    const url = new URL(window.location.href);
    const connected = url.searchParams.get("composio_connected");
    const failed = url.searchParams.get("composio_error");
    if (!connected && !failed) return;
    if (failed) toast.error(failed);
    else toast.success("Connected.");
    url.searchParams.delete("composio_connected");
    url.searchParams.delete("composio_error");
    window.history.replaceState(null, "", url.toString());
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 md:p-6 dark:border-zinc-800/80 dark:bg-zinc-900/40">
      <SkillSettingsPanel
        engagementId={engagementId}
        skillId={skillId}
        layout="page"
        onClose={() => router.push(backHref)}
        onSaved={(notice) => {
          toast.success(notice ? `${name} saved. ${notice}` : `${name} saved.`);
          router.refresh();
        }}
      />
    </div>
  );
}
