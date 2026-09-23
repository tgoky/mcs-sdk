import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { getColdOpenConfig } from "@/features/cold-open/server/config";
import { saveVoiceCapture, type VoiceCaptureInput } from "@/features/cold-open/server/voice-capture";
import { getClientFact, recordDossierDecisions } from "@/lib/client-facts";

export const runtime = "nodejs";
export const revalidate = 0;

/**
 * Voice Capture's own hinges — save-only, same shape as bridges/win-back/
 * route.ts: not a gate on enabling (the generic toggle route already
 * works), just an optional config screen reachable anytime.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.whopUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const activeWorkspace = await getActiveWorkspace(session.whopUserId);

  const [row] = await db
    .select({ buyer: engagements.buyer })
    .from(engagements)
    .where(and(eq(engagements.engagementId, id), eq(engagements.whopUserId, session.whopUserId), eq(engagements.workspaceId, activeWorkspace.workspaceId)))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Engagement not found or access denied" }, { status: 404 });
  }

  const config = await getColdOpenConfig(id);
  // The voice read from the client's website, offered while no voice is
  // saved yet. Shown whether or not it cleared the auto-apply threshold
  // (with its score), since nothing here fills it in by itself.
  const voiceFact = config?.voiceProfile ? null : await getClientFact(id, "voiceProfile");
  const suggestions =
    voiceFact && voiceFact.status !== "rejected"
      ? {
          voiceProfile: {
            value: voiceFact.value,
            source: voiceFact.source,
            sourceDetail: voiceFact.sourceDetail,
            confidence: voiceFact.confidence,
            evidence: voiceFact.evidence,
          },
        }
      : {};
  return NextResponse.json({
    buyer: row.buyer,
    suggestions,
    voiceProfile: config?.voiceProfile ?? null,
    subjectVariants: config?.subjectVariants ?? [],
    bodyVariantPools: config?.bodyVariantPools ?? {},
    icps: config?.icps ?? [],
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const activeWorkspace = await getActiveWorkspace(session.whopUserId);

    const [row] = await db
      .select({ engagementId: engagements.engagementId })
      .from(engagements)
      .where(and(eq(engagements.engagementId, id), eq(engagements.whopUserId, session.whopUserId), eq(engagements.workspaceId, activeWorkspace.workspaceId)))
      .limit(1);

    if (!row) {
      return NextResponse.json({ error: "Engagement not found or access denied" }, { status: 404 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const input: VoiceCaptureInput = {
      greeting: typeof body.greeting === "string" ? body.greeting : "",
      signOff: typeof body.signOff === "string" ? body.signOff : "",
      tone: typeof body.tone === "string" ? body.tone : "",
      sourceDomain: typeof body.sourceDomain === "string" ? body.sourceDomain : undefined,
      subjectVariants: Array.isArray(body.subjectVariants) ? body.subjectVariants : [],
      bodyVariantPools: typeof body.bodyVariantPools === "object" && body.bodyVariantPools !== null ? body.bodyVariantPools : {},
    };

    const result = await saveVoiceCapture(id, input);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // Kept the website's voice -> confirmed; changed it -> edited, so it
    // isn't suggested again.
    await recordDossierDecisions(id, {
      voiceProfile: { greeting: input.greeting.trim(), signOff: input.signOff.trim(), tone: input.tone.trim() },
    }).catch((err) => console.error(`[bridges/voice-capture] recording suggestion decision failed for ${id}:`, err));

    return NextResponse.json({ ok: true, warnings: result.warnings });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[engagements/[id]/bridges/voice-capture]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
