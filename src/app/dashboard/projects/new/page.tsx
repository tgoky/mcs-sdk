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
    <div className="relative min-h-screen w-full text-zinc-600 dark:text-zinc-400 font-sans tracking-tight antialiased select-none px-1 transition-colors duration-200 overflow-hidden pb-10">
      
      {/* --- HYPER-MICRO TIGHT DOT GRID OVERLAY --- */}
      <div 
        className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(#cbd5e1_0.5px,transparent_0.5px)] dark:bg-[radial-gradient(#3f3f46_0.5px,transparent_0.5px)] [background-size:6px_6px] [mask-image:radial-gradient(ellipse_75%_75%_at_50%_30%,#000_50%,transparent_100%)] opacity-70" 
        aria-hidden="true"
      />

      <div className="relative z-10 max-w-2xl mx-auto space-y-4">
        <div className="border-b border-zinc-200 dark:border-zinc-800 pb-3">
          <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
            Create New Project Archetype
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Configure default skill toggles for clients assigned to this project template.
          </p>
        </div>

        <NewProjectForm clients={clients} />
      </div>
    </div>
  );
}