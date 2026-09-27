// src/app/dashboard/engagements/[id]/skills/[skillId]/settings/page.tsx
//
// A skill's settings as a page of its own: where a gear goes on a phone,
// what the settings pane's "open as page" opens, and where signing in to
// a tool from the settings comes back to.

import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { SetBreadcrumbLabel } from "@/components/breadcrumbs/breadcrumb-context";
import { AnySkillBadge } from "@/components/any-skill-badge";
import { hasSkillSettings } from "@/lib/skill-settings/schema";
import { WORKER_REGISTRY, workerPrimaryHref, isWorkerId } from "@/lib/worker-registry";
import { loadOwnedEngagement } from "../../../owned-engagement";
import { SkillSettingsPageClient } from "./settings-page-client";

export const revalidate = 0;

export default async function SkillSettingsPage({ params }: { params: Promise<{ id: string; skillId: string }> }) {
  const { id, skillId } = await params;
  if (!isWorkerId(skillId) || !hasSkillSettings(skillId)) notFound();
  const engagement = await loadOwnedEngagement(id);
  if (!engagement) notFound();
  const worker = WORKER_REGISTRY[skillId];
  const back = workerPrimaryHref(skillId, id);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 pb-10 font-sans antialiased">
      <SetBreadcrumbLabel label={`${engagement.buyer} · ${worker.name} settings`} />
      <div className="flex items-center gap-3">
        <Link
          href={back}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-zinc-100/80 text-zinc-700 transition-colors hover:bg-zinc-200 dark:border-zinc-800/80 dark:bg-zinc-900/80 dark:text-zinc-200 dark:hover:bg-zinc-800"
          aria-label={`Back to ${worker.name}`}
          title={`Back to ${worker.name}`}
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <AnySkillBadge skill={skillId} size={28} />
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold tracking-tight text-zinc-900 dark:text-white">{worker.name} settings</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">For {engagement.buyer}</p>
        </div>
      </div>
      <SkillSettingsPageClient engagementId={id} skillId={skillId} backHref={back} />
    </div>
  );
}
