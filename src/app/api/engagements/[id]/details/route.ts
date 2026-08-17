import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements, type EngagementStack } from "@/models/schema";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { and, eq } from "drizzle-orm";
import { TEMPLATE_IDS } from "@/features/pin-down/server/templates/types";
import {
  NOTIFICATION_PACK,
  activateNotificationPackAlert,
  deactivateNotificationPackAlert,
} from "@/features/leak-map/server/notification-pack";

const EDITABLE_TRAFFIC_TEMPERATURES = ["cold", "warm", "hot"] as const;
const EDITABLE_CASTING_CHOICES = ["founder_on_camera", "coach_on_camera", "animation", "other"] as const;
const VALID_PACK_ALERT_IDS = new Set(NOTIFICATION_PACK.map((p) => p.id));

/**
 * Edits the onboarding-captured client data that EditStackSettings
 * (PATCH /api/engagements/[id]) deliberately doesn't touch — the offer,
 * voice/proof material, prospect-research questions, confirmation page
 * template, and notification pack selections. See client-details-drawer.tsx
 * for the form this backs.
 *
 * Same "explicit allowlist, not a blob merge" philosophy as the stack
 * PATCH route: every field is validated and merged individually rather
 * than trusting whatever shape the client sends.
 *
 * What this does NOT do: retroactively regenerate content already built
 * from these inputs (Pin-Down scripts/confirmation page, Pile-On ad
 * creative briefs). Some downstream consumers read these fields live on
 * every run (e.g. Pre-Call Read's brief-service.ts reads topCallQuestions/
 * topObjections fresh each time) and pick up an edit automatically; others
 * bake them into content generated once during onboarding and need an
 * explicit regenerate — see /api/engagements/[id]/regenerate/*.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const activeWorkspace = await getActiveWorkspace(session.whopUserId);

    const [existing] = await db
      .select({
        offerDetails: engagements.offerDetails,
        topCallQuestions: engagements.topCallQuestions,
        topObjections: engagements.topObjections,
        prospectMeets: engagements.prospectMeets,
        castingChoice: engagements.castingChoice,
        rawVoiceCorpus: engagements.rawVoiceCorpus,
        existingProof: engagements.existingProof,
        confirmationPageTemplate: engagements.confirmationPageTemplate,
        stack: engagements.stack,
        deletedAt: engagements.deletedAt,
      })
      .from(engagements)
      .where(
        and(
          eq(engagements.engagementId, id),
          eq(engagements.whopUserId, session.whopUserId),
          eq(engagements.workspaceId, activeWorkspace.workspaceId)
        )
      )
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "Engagement not found or access denied." }, { status: 404 });
    }
    if (existing.deletedAt) {
      return NextResponse.json({ error: "Can't edit a deleted engagement." }, { status: 409 });
    }

    const incoming = body as Record<string, unknown>;

    // ── Offer details — partial merge onto the existing object ──────────
    let nextOfferDetails = existing.offerDetails;
    if (incoming.offerDetails !== undefined) {
      const od = incoming.offerDetails;
      if (typeof od !== "object" || od === null) {
        return NextResponse.json({ error: "offerDetails must be an object." }, { status: 400 });
      }
      const o = od as Record<string, unknown>;
      for (const field of ["name", "price", "icp", "vertical"] as const) {
        if (o[field] !== undefined && typeof o[field] !== "string") {
          return NextResponse.json({ error: `offerDetails.${field} must be a string.` }, { status: 400 });
        }
      }
      if (o.traffic_temperature !== undefined && !EDITABLE_TRAFFIC_TEMPERATURES.includes(o.traffic_temperature as never)) {
        return NextResponse.json({ error: `Invalid offerDetails.traffic_temperature: ${o.traffic_temperature}` }, { status: 400 });
      }
      if (o.hybrid_mode_enabled !== undefined && typeof o.hybrid_mode_enabled !== "boolean") {
        return NextResponse.json({ error: "offerDetails.hybrid_mode_enabled must be a boolean." }, { status: 400 });
      }
      nextOfferDetails = {
        name: "",
        price: "",
        icp: "",
        traffic_temperature: "warm",
        hybrid_mode_enabled: false,
        ...existing.offerDetails,
        ...o,
      } as typeof existing.offerDetails;
    }

    // ── Top call questions / objections — full-array replacement ────────
    function parseStringArray(value: unknown, fieldName: string): string[] | undefined | { error: string } {
      if (value === undefined) return undefined;
      if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
        return { error: `${fieldName} must be an array of strings.` };
      }
      return value.map((v) => v.trim()).filter(Boolean);
    }

    const topCallQuestionsResult = parseStringArray(incoming.topCallQuestions, "topCallQuestions");
    if (topCallQuestionsResult && "error" in topCallQuestionsResult) {
      return NextResponse.json({ error: topCallQuestionsResult.error }, { status: 400 });
    }
    const topObjectionsResult = parseStringArray(incoming.topObjections, "topObjections");
    if (topObjectionsResult && "error" in topObjectionsResult) {
      return NextResponse.json({ error: topObjectionsResult.error }, { status: 400 });
    }

    // ── Prospect meets / casting choice ──────────────────────────────────
    if (incoming.prospectMeets !== undefined && typeof incoming.prospectMeets !== "string") {
      return NextResponse.json({ error: "prospectMeets must be a string." }, { status: 400 });
    }
    if (
      incoming.castingChoice !== undefined &&
      incoming.castingChoice !== null &&
      !EDITABLE_CASTING_CHOICES.includes(incoming.castingChoice as never)
    ) {
      return NextResponse.json({ error: `Invalid castingChoice: ${incoming.castingChoice}` }, { status: 400 });
    }

    // ── Raw voice corpus ──────────────────────────────────────────────────
    if (incoming.rawVoiceCorpus !== undefined && typeof incoming.rawVoiceCorpus !== "string") {
      return NextResponse.json({ error: "rawVoiceCorpus must be a string." }, { status: 400 });
    }

    // ── Testimonials — full-array replacement, same shape the wizard uses ─
    let nextExistingProof = existing.existingProof;
    if (incoming.existingProof !== undefined) {
      const ep = incoming.existingProof;
      if (typeof ep !== "object" || ep === null || !Array.isArray((ep as Record<string, unknown>).testimonials)) {
        return NextResponse.json({ error: "existingProof.testimonials must be an array." }, { status: 400 });
      }
      const testimonials = (ep as { testimonials: unknown[] }).testimonials;
      for (const t of testimonials) {
        if (
          typeof t !== "object" ||
          t === null ||
          typeof (t as Record<string, unknown>).name !== "string" ||
          typeof (t as Record<string, unknown>).role !== "string" ||
          typeof (t as Record<string, unknown>).quote !== "string"
        ) {
          return NextResponse.json({ error: "Each testimonial needs name, role, and quote (all strings)." }, { status: 400 });
        }
      }
      // Same "only ships with real content" rule the wizard applies at submit.
      const filtered = (testimonials as Array<{ name: string; role: string; quote: string; company?: string; sourceUrl?: string }>).filter(
        (t) => t.name.trim() && t.role.trim() && t.quote.trim()
      );
      nextExistingProof = filtered.length ? { testimonials: filtered } : null;
    }

    // ── Confirmation page template ────────────────────────────────────────
    if (incoming.confirmationPageTemplate !== undefined && !TEMPLATE_IDS.includes(incoming.confirmationPageTemplate as never)) {
      return NextResponse.json({ error: `Invalid confirmationPageTemplate: ${incoming.confirmationPageTemplate}` }, { status: 400 });
    }

    // ── Notification pack selections — diff against current, apply side effects ─
    let nextStack: EngagementStack | null = existing.stack as EngagementStack | null;
    if (incoming.notificationPackSelections !== undefined) {
      const sel = incoming.notificationPackSelections;
      if (!Array.isArray(sel) || sel.some((v) => typeof v !== "string")) {
        return NextResponse.json({ error: "notificationPackSelections must be an array of strings." }, { status: 400 });
      }
      const nextSelections = [...new Set(sel as string[])];
      for (const packId of nextSelections) {
        if (!VALID_PACK_ALERT_IDS.has(packId)) {
          return NextResponse.json({ error: `Unknown notification pack alert id: ${packId}` }, { status: 400 });
        }
      }
      const currentStackForDiff = (existing.stack as EngagementStack | null) ?? ({} as EngagementStack);
      const currentSelections = new Set(currentStackForDiff.notification_pack_selections ?? []);
      const nextSelectionsSet = new Set(nextSelections);

      for (const packId of nextSelections) {
        if (!currentSelections.has(packId)) {
          await activateNotificationPackAlert(id, packId);
        }
      }
      for (const packId of currentSelections) {
        if (!nextSelectionsSet.has(packId)) {
          await deactivateNotificationPackAlert(id, packId);
        }
      }

      nextStack = { ...currentStackForDiff, notification_pack_selections: nextSelections };
    }

    await db
      .update(engagements)
      .set({
        offerDetails: nextOfferDetails,
        ...(topCallQuestionsResult !== undefined ? { topCallQuestions: topCallQuestionsResult } : {}),
        ...(topObjectionsResult !== undefined ? { topObjections: topObjectionsResult } : {}),
        ...(incoming.prospectMeets !== undefined ? { prospectMeets: incoming.prospectMeets as string } : {}),
        ...(incoming.castingChoice !== undefined ? { castingChoice: incoming.castingChoice as string | null } : {}),
        ...(incoming.rawVoiceCorpus !== undefined ? { rawVoiceCorpus: incoming.rawVoiceCorpus as string } : {}),
        existingProof: nextExistingProof,
        ...(incoming.confirmationPageTemplate !== undefined
          ? { confirmationPageTemplate: incoming.confirmationPageTemplate as string }
          : {}),
        ...(nextStack !== existing.stack ? { stack: nextStack } : {}),
        updatedAt: new Date(),
      })
      .where(eq(engagements.engagementId, id));

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[engagements/[id]/details PATCH]", err);
    return NextResponse.json({ error: "Failed to update client details." }, { status: 500 });
  }
}
