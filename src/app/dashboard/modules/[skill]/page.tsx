import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { getModuleClientSummaries } from "@/lib/module-overview";
import { isSkillId, SKILL_MANIFEST } from "@/lib/skill-manifest";
import { ModulePortfolioShell } from "@/components/module-views/module-porfolio-shell";

export default async function ModulePage({
  params,
}: {
  params: { skill: string };
}) {
  const { skill } = params;

  // 1. Verify the URL parameter corresponds to a valid skill ID
  if (!isSkillId(skill)) {
    notFound();
  }

  // 2. Fetch authenticated session and per-client module summaries
  const session = await getSession();
  const summaries = await getModuleClientSummaries(session.whopUserId, skill);
  const manifest = SKILL_MANIFEST[skill];

  // 3. Render the Agency Command Center Portfolio Shell
  return (
    <ModulePortfolioShell
      skillId={skill}
      manifest={manifest}
      summaries={summaries}
    />
  );
}