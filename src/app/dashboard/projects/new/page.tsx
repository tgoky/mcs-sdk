import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { getSession } from "@/lib/session";
import { and, eq, isNull, desc } from "drizzle-orm";
import { NewProjectForm } from "./new-project-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function NewProjectPage() {
  const session = await getSession();
  const whopUserId = session.whopUserId!;

  const clients = await db
    .select({ engagementId: engagements.engagementId, buyer: engagements.buyer })
    .from(engagements)
    .where(and(eq(engagements.whopUserId, whopUserId), isNull(engagements.deletedAt)))
    .orderBy(desc(engagements.createdAt));

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-1">New project</h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
        Pick which skills run by default for clients in this project, then optionally add clients now — you can
        always add more later.
      </p>
      <NewProjectForm clients={clients} />
    </div>
  );
}
