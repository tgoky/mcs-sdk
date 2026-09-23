import { NextResponse } from "next/server";
import { recordDossierDecisions } from "@/lib/client-facts";
import { seedPrimaryDomainFromUrl } from "@/lib/client-profile";
import { setSkillEnabledForEngagement } from "@/lib/engagement-skills";
import { dispatchSkillRun } from "@/lib/skill-dispatch";
import { COLD_OPEN_SKILL_IDS } from "@/lib/cold-open-skill-manifest";
import { parseColdOpenSetup, saveColdOpenSetup } from "@/lib/cold-open-setup/save";
import { authorizeProductSetup } from "../../showtime/access";

export const runtime = "nodejs";
export const revalidate = 0;

/** Saves the reviewed Cold Open setup. Never turns live sending on. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await authorizeProductSetup(id, "cold-open", { requireInstalled: true });
  if (!access.ok) return access.response;

  const input = parseColdOpenSetup(await req.json().catch(() => null));
  if ("error" in input) return NextResponse.json({ error: input.error }, { status: 400 });

  try {
    const result = await saveColdOpenSetup(id, input);
    if ("error" in result) return NextResponse.json({ error: result.error, step: result.step }, { status: 400 });

    await recordDossierDecisions(id, {
      productIdentity: input.product,
      icps: input.icps.map(({ slug, label, weight }) => ({ slug, label, weight })),
      voiceProfile: input.voice,
      sizingBounds: Object.fromEntries(input.icps.map((i) => [i.slug, { teamSizeMin: i.teamSizeMin ?? undefined, teamSizeMax: i.teamSizeMax ?? undefined, disqualifyIf: i.disqualifyIf }])),
    }).catch((err) => console.error(`[setup/cold-open/save] recording decisions failed for ${id}:`, err));

    await setSkillEnabledForEngagement(id, "icp-lock", true);
    const chosen = new Set(input.skills);
    for (const skill of COLD_OPEN_SKILL_IDS) if (skill !== "icp-lock") await setSkillEnabledForEngagement(id, skill, chosen.has(skill));

    if (input.product.url) {
      seedPrimaryDomainFromUrl(id, input.product.url).catch((err) => console.error(`[setup/cold-open/save] domain seed failed for ${id}:`, err));
    }
    const runId = await dispatchSkillRun(id, "icp-lock", access.buyer);
    return NextResponse.json({ ok: true, runId, warnings: result.warnings, sendingSaved: result.sendingSaved });
  } catch (err) {
    console.error(`[setup/cold-open/save] ${id}:`, err);
    return NextResponse.json({ error: "Couldn't save. Try again." }, { status: 500 });
  }
}
