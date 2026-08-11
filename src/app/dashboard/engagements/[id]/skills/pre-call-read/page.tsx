// src/app/dashboard/engagements/[id]/skills/pre-call-read/page.tsx
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { getSession } from "@/lib/session";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/back-link";
import { SetBreadcrumbLabel } from "@/components/breadcrumbs/breadcrumb-context";
import { PreCallReadPipeline } from "../../pre-call-read-pipeline";

export const revalidate = 0;

export default async function PreCallReadSkillPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();

  const [engagement] = await db
    .select({ engagementId: engagements.engagementId, buyer: engagements.buyer })
    .from(engagements)
    .where(and(eq(engagements.engagementId, id), eq(engagements.whopUserId, session?.whopUserId ?? "")))
    .limit(1);

  if (!engagement) notFound();

  return (
    <div className="space-y-4 font-sans antialiased">
      <SetBreadcrumbLabel label={`${engagement.buyer} · Pre-Call Read`} />
      <BackLink href={`/dashboard/engagements/${id}`} label="Back to engagement" />

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
