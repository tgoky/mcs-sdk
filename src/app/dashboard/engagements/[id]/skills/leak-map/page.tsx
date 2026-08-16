// src/app/dashboard/engagements/[id]/skills/leak-map/page.tsx
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { SetBreadcrumbLabel } from "@/components/breadcrumbs/breadcrumb-context";
import { LeakMapSchedule } from "../../leak-map-schedule";

export const revalidate = 0;

export default async function LeakMapSkillPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { id } = await params;
  const { from } = await searchParams;
  const session = await getSession();
  const activeWorkspace = await getActiveWorkspace(session?.whopUserId ?? "");

  const [engagement] = await db
    .select({ engagementId: engagements.engagementId, buyer: engagements.buyer })
    .from(engagements)
    .where(
      and(
        eq(engagements.engagementId, id),
        eq(engagements.whopUserId, session?.whopUserId ?? ""),
        eq(engagements.workspaceId, activeWorkspace.workspaceId)
      )
    )
    .limit(1);

  if (!engagement) notFound();

  // Dynamic back link destination and label
  const isFromModule = from && from.startsWith("/dashboard/modules");
  const backHref = isFromModule ? from : `/dashboard/engagements/${id}`;
  const backLabel = isFromModule ? "Back to Module" : "Back to engagement";

  return (
    <div className="space-y-4 font-sans antialiased">
      <SetBreadcrumbLabel label={`${engagement.buyer} · Leak-Map`} />

      {/* Circular Back Button & Title in the same horizontal row */}
      <div className="flex items-center gap-3">
        <Link
          href={backHref}
          className="flex items-center justify-center w-8 h-8 rounded-full border border-zinc-200 dark:border-zinc-800/80 bg-zinc-100/80 dark:bg-zinc-900/80 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 transition-colors shrink-0"
          aria-label={backLabel}
          title={backLabel}
        >
          <ChevronLeft className="w-4 h-4" />
        </Link>

        <div>
          <h1 className="text-lg font-bold text-zinc-900 dark:text-white tracking-tight">
            Leak-Map — {engagement.buyer}
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Every audit this engagement has ever run, not just today&apos;s calendar.
          </p>
        </div>
      </div>

      <LeakMapSchedule engagementId={id} />
    </div>
  );
}