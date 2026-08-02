import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { getModuleClientSummaries } from "@/lib/module-overview";
import { isSkillId, SKILL_MANIFEST } from "@/lib/skill-manifest";
import { ModulePortfolioShell } from "@/components/module-views/module-porfolio-shell";

export default async function ModulePage({ params }: { params: { skill: string } }) {
  if (!isSkillId(params.skill)) {
    notFound();
  }

  const session = await getSession();
  const summaries = await getModuleClientSummaries(session.whopUserId, params.skill);
  const manifest = SKILL_MANIFEST[params.skill];

  return <ModulePortfolioShell skillId={params.skill} manifest={manifest} summaries={summaries} />;
}