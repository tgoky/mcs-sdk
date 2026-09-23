// src/app/dashboard/engagements/[id]/skill-pages.tsx
//
// What each skill page shows: its title, one-line subtitle, header action
// (usually the Configure menu) and body. skills/[skillId]/page.tsx renders
// every one of them in the same shell (access check, back link,
// breadcrumb, header), replacing twelve near-identical page files. Adding
// a skill page means adding one entry here.
//
// Bodies are async server components that load only what they show.

import type { ReactNode } from "react";
import Link from "next/link";
import { db } from "@/lib/db";
import { engagements, conversationIntelligenceSessions } from "@/models/schema";
import { desc, eq } from "drizzle-orm";
import { skillName } from "@/lib/copy";
import { computeWinBackRevenueAttribution } from "@/features/win-back/server/revenue-attribution";
import type { WorkerId } from "@/lib/worker-registry";
import type { OwnedEngagement } from "./owned-engagement";
import { SkillConfigureMenu } from "./skill-configure-menu";
import { DeliverablesPanel, type BrandVoiceProfile } from "./deliverables-panel";
import { WinBackPipeline } from "./win-back-pipeline";
import { WinBackRevenueSection } from "./win-back-revenue-section";
import { WinBackCadencePreview } from "./win-back-cadence-preview";
import { LeakMapSchedule } from "./leak-map-schedule";
import { PileOnPipeline } from "./pile-on-pipeline";
import { PileOnAdCreativeBriefs } from "./pile-on-ad-creative-briefs";
import { PreCallReadPipeline } from "./pre-call-read-pipeline";
import { ColdOpenFindingsPanel } from "./cold-open-findings-panel";
import { RepFindingsPanel } from "./rep-findings-panel";
import { AdsConsole } from "@/components/skill-consoles/ads-console";
import { BridgeManagerConsole } from "@/components/skill-consoles/bridge-manager-console";
import { DisputeResponseConsole } from "@/components/skill-consoles/dispute-response-console";
import { PayoutHoldConsole } from "@/components/skill-consoles/payout-hold-console";
import { WebhookAuditConsole } from "@/components/skill-consoles/webhook-audit-console";

export interface SkillPageContext {
  engagement: OwnedEngagement;
  searchParams: Record<string, string | string[] | undefined>;
}

export interface SkillPageDefinition {
  title: string;
  /** Breadcrumb label, when it differs from the title. */
  breadcrumb?: string;
  subtitle?: ReactNode;
  /** Right side of the header — the Configure menu for configurable skills. */
  headerAction?: (ctx: SkillPageContext) => ReactNode;
  body: (ctx: SkillPageContext) => ReactNode | Promise<ReactNode>;
}

/** Where the back link goes: the module page the user came from, when
 * ?from= names one, otherwise the client page. */
export function skillPageBackLink(engagementId: string, from: string | string[] | undefined): { href: string; label: string } {
  if (typeof from === "string" && from.startsWith("/dashboard/modules")) return { href: from, label: "Back to Module" };
  return { href: `/dashboard/engagements/${engagementId}`, label: "Back to client" };
}

const configure = (skillId: WorkerId) => (ctx: SkillPageContext) => <SkillConfigureMenu skillId={skillId} engagementId={ctx.engagement.engagementId} />;

// ── Bodies that load data ─────────────────────────────────────────────

async function PinDownBody({ engagement }: SkillPageContext) {
  const id = engagement.engagementId;
  const [[row], sessions] = await Promise.all([
    db
      .select({
        discoveryPrefill: engagements.discoveryPrefill,
        voiceScrapeArtifacts: engagements.voiceScrapeArtifacts,
        brandVoiceProfile: engagements.brandVoiceProfile,
        adCreativeBriefs: engagements.adCreativeBriefs,
        pinDownScriptPack: engagements.pinDownScriptPack,
        pinDownPageAudit: engagements.pinDownPageAudit,
      })
      .from(engagements)
      .where(eq(engagements.engagementId, id))
      .limit(1),
    db
      .select()
      .from(conversationIntelligenceSessions)
      .where(eq(conversationIntelligenceSessions.engagementId, id))
      .orderBy(desc(conversationIntelligenceSessions.createdAt))
      .limit(20),
  ]);
  if (!row) return null;
  return (
    <DeliverablesPanel
      engagementId={id}
      discoveryPrefill={row.discoveryPrefill}
      voiceScrapeArtifacts={row.voiceScrapeArtifacts}
      brandVoiceProfile={row.brandVoiceProfile as BrandVoiceProfile}
      adCreativeBriefs={row.adCreativeBriefs}
      pinDownScriptPack={row.pinDownScriptPack}
      pinDownPageAudit={row.pinDownPageAudit}
      conversationIntelligence={{
        enabled: engagement.stack?.conversation_intelligence_provider === "recall_ai",
        lastProcessedAt: sessions.find((s) => s.completedAt)?.completedAt?.toISOString(),
      }}
    />
  );
}

async function WinBackBody({ engagement }: SkillPageContext) {
  const id = engagement.engagementId;
  const yearStart = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
  const [[row], revenue] = await Promise.all([
    db.select({ winBackSequenceAssetMap: engagements.winBackSequenceAssetMap }).from(engagements).where(eq(engagements.engagementId, id)).limit(1),
    computeWinBackRevenueAttribution(id, yearStart),
  ]);
  return (
    <>
      <WinBackPipeline engagementId={id} />
      <WinBackCadencePreview assetMap={row?.winBackSequenceAssetMap ?? null} engagementId={id} />
      <WinBackRevenueSection
        engagementId={id}
        offerPrice={revenue.offerPrice}
        initialEnrollments={revenue.recoveredEnrollments}
        initialPeriodLabel={revenue.periodLabel}
      />
    </>
  );
}

async function PileOnBody({ engagement }: SkillPageContext) {
  const id = engagement.engagementId;
  const [row] = await db.select({ adCreativeBriefs: engagements.adCreativeBriefs }).from(engagements).where(eq(engagements.engagementId, id)).limit(1);
  return (
    <>
      <PileOnPipeline engagementId={id} />
      <PileOnAdCreativeBriefs pack={row?.adCreativeBriefs ?? null} />
    </>
  );
}

type FindingsSource = "engine" | "trustpilot" | "reddit" | "twitter";
const FINDINGS_SOURCES: ReadonlySet<string> = new Set<FindingsSource>(["engine", "trustpilot", "reddit", "twitter"]);

function ReputationManagerBody({ engagement, searchParams }: SkillPageContext) {
  // ?source= pre-selects one watch's findings (workerPrimaryHref links here that way).
  const source = typeof searchParams.source === "string" && FINDINGS_SOURCES.has(searchParams.source) ? (searchParams.source as FindingsSource) : null;
  return <RepFindingsPanel engagementId={engagement.engagementId} initialSource={source} />;
}

// ── The pages ─────────────────────────────────────────────────────────

export const SKILL_PAGES: Record<string, SkillPageDefinition> = {
  "pin-down": {
    title: "Show Rate Setup",
    subtitle: "Brand voice, ad creative briefs, video scripts, and confirmation page — the one-time onboarding output, not an ongoing run.",
    headerAction: configure("pin-down"),
    body: (ctx) => <PinDownBody {...ctx} />,
  },
  "win-back": {
    title: "Booking Recovery",
    subtitle: "Every enrolled prospect across the whole recovery cadence — not one run page at a time.",
    headerAction: configure("win-back"),
    body: (ctx) => <WinBackBody {...ctx} />,
  },
  "leak-map": {
    title: "Funnel Audit",
    subtitle: "Automated weekly and monthly audits checking for drop-off points and funnel leaks.",
    headerAction: configure("leak-map"),
    body: ({ engagement }) => <LeakMapSchedule engagementId={engagement.engagementId} />,
  },
  "pile-on": {
    title: skillName("pile-on"),
    subtitle: "Every speed-to-lead sequence this client has ever run, not just today's calendar.",
    // Pile-On's small form takes its current values from the stack.
    headerAction: ({ engagement }) => (
      <SkillConfigureMenu
        skillId="pile-on"
        engagementId={engagement.engagementId}
        pileOnInitial={{ smsPlatform: engagement.stack?.sms_platform ?? "none", adDataPlatform: engagement.stack?.ad_data_platform ?? "none" }}
      />
    ),
    body: (ctx) => <PileOnBody {...ctx} />,
  },
  "pre-call-read": {
    title: "Call Brief",
    subtitle: "Every call this client has ever had, not just today's calendar.",
    headerAction: configure("pre-call-read"),
    body: ({ engagement }) => <PreCallReadPipeline engagementId={engagement.engagementId} />,
  },
  "cold-open": {
    title: "Cold Open",
    subtitle:
      "Every lead pushed and every reply classified across ICP Lock, Voice Capture, Source Connect, Send Connect, Daily Send, Reply Sort, and Send Report for this client.",
    body: ({ engagement }) => <ColdOpenFindingsPanel engagementId={engagement.engagementId} />,
  },
  "reputation-manager": {
    title: "Reputation Manager",
    subtitle: (
      <>
        Every finding, review, and mention on file for this client — AI engines, Trustpilot, Reddit, and X.{" "}
        <Link href="/dashboard/reputation-manager/incidents" className="underline underline-offset-2 hover:text-zinc-700 dark:hover:text-zinc-300">
          Manage declared incidents →
        </Link>
      </>
    ),
    body: (ctx) => <ReputationManagerBody {...ctx} />,
  },
  "whop-webhook-audit": {
    title: "Webhook Fleet Console",
    breadcrumb: "Webhook Fleet",
    body: ({ engagement }) => <WebhookAuditConsole engagementId={engagement.engagementId} />,
  },
  "whop-ads-draft-approve": {
    title: "Whop Ads",
    body: ({ engagement }) => <AdsConsole engagementId={engagement.engagementId} />,
  },
  "whop-payout-hold-kit": {
    title: "Payout Hold Kit",
    body: ({ engagement }) => <PayoutHoldConsole engagementId={engagement.engagementId} />,
  },
  "whop-dispute-response": {
    title: "Dispute Response",
    body: ({ engagement }) => <DisputeResponseConsole engagementId={engagement.engagementId} />,
  },
  "whop-bridge-manager": {
    title: "Bridge Manager",
    // No Configure menu: the console below is the config form.
    body: ({ engagement }) => <BridgeManagerConsole engagementId={engagement.engagementId} />,
  },
};
