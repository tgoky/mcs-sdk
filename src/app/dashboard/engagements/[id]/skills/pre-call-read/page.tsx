// src/app/dashboard/engagements/[id]/skills/pre-call-read/page.tsx
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/back-link";
import { SetBreadcrumbLabel } from "@/components/breadcrumbs/breadcrumb-context";
import { PreCallReadPipeline } from "../../pre-call-read-pipeline";

export const revalidate = 0;

export default async function PreCallReadSkillPage({
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

  // Dynamic back link resolution
  const isFromModule = from && from.startsWith("/dashboard/modules");
  const backHref = isFromModule ? from : `/dashboard/engagements/${id}`;
  const backLabel = isFromModule ? "Back to Module" : "Back to engagement";

  return (
    <div className="space-y-4 font-sans antialiased">
      <SetBreadcrumbLabel label={`${engagement.buyer} · Pre-Call Read`} />
      <BackLink href={backHref} label={backLabel} />

      <div>
        <h1 className="text-lg font-bold text-white">Pre-Call Read — {engagement.buyer}</h1>
        <p className="text-xs text-zinc-500 mt-0.5">
          Every call this engagement has ever had, not just today&apos;s calendar.
        </p>
      </div>

      <PreCallReadPipeline engagementId={id} />
    </div>
  );
}