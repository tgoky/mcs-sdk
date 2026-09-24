import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { getClientFact, getClientFacts, upsertClientFact } from "@/lib/client-facts";
import { getPrimaryDomainForEngagement, seedPrimaryDomainFromUrl } from "@/lib/client-profile";
import { discoverClient } from "@/lib/discover-client";
import { resolveColdOpenDerivedFields } from "@/lib/field-resolvers";
import { hasCredential, resolveCredential } from "@/lib/credentials";
import { getColdOpenConfig } from "@/features/cold-open/server/config";
import { hostOf } from "@/lib/rep-setup/proposal";
import { importTouchset, platformSubject, rankSubjects, touchsetsFromSteps } from "@/lib/cold-open-setup/analyze";
import { pullSender } from "@/lib/cold-open-setup/sender";
import { pullHubSpotBuyers } from "@/lib/cold-open-setup/buyers";
import { summarizeOutbound } from "@/lib/cold-open-setup/outbound";
import { matchCampaigns } from "@/lib/cold-open-setup/jev";
import { connectedPlatform, platformLabel, sendProvider } from "@/lib/cold-open-setup/state";
import type { ActivationStep } from "@/lib/showtime-setup/types";
import type { ColdOpenIcp } from "@/models/schema";
import { authorizeProductSetup } from "../../showtime/access";

export const runtime = "nodejs";
export const revalidate = 0;
// A first site read, the sending platform, the CRM and Jev together.
export const maxDuration = 300;

const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

/**
 * Cold Open's "Set it up": reads the website (once per client), then the
 * sending platform's past campaigns, emails, mailboxes and domains, then
 * who really bought from the CRM, then has Jev match each ICP to one of
 * their campaigns. Streams one NDJSON line per finished step.
 *
 * Writes suggestions only (client_facts); nothing is saved to Cold Open
 * and nothing is sent until the person saves the review.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await authorizeProductSetup(id, "cold-open", { requireInstalled: true });
  if (!access.ok) return access.response;

  const body = (await req.json().catch(() => ({}))) as { domain?: unknown };
  const typedHost = typeof body.domain === "string" ? hostOf(body.domain) : null;
  if (typeof body.domain === "string" && body.domain.trim() && !typedHost) {
    return NextResponse.json({ error: "That doesn't look like a website address." }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (line: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
      const step = (s: ActivationStep) => send({ type: "step", step: s });
      try {
        // ── 1. The website (read once, shared by every product) ──
        const before = await getPrimaryDomainForEngagement(id);
        if (typedHost && hostOf(before) !== typedHost) await seedPrimaryDomainFromUrl(id, typedHost);
        const host = hostOf((await getPrimaryDomainForEngagement(id)) ?? typedHost);
        if (host) {
          const corpus = await getClientFact(id, "rawVoiceCorpus");
          if (corpus && typeof corpus.value === "string" && corpus.value.trim() && hostOf(corpus.sourceDetail) === host) {
            step({ id: "site", label: `Already read ${host}`, status: "reused", detail: corpus.updatedAt.toISOString() });
            // Read for another product: the Cold Open fields may not exist yet.
            const have = await Promise.all(["productIdentity", "icps", "voiceProfile"].map((k) => getClientFact(id, k)));
            if (have.some((f) => !f || f.status === "rejected")) {
              await resolveColdOpenDerivedFields(id).catch((err) => console.warn(`[setup/cold-open/activate] cold open read failed for ${id}:`, err instanceof Error ? err.message : err));
            }
          } else {
            const result = await discoverClient(id);
            step(
              result.ran && result.factsWritten.includes("rawVoiceCorpus")
                ? { id: "site", label: `Read ${host}`, status: "done" }
                : { id: "site", label: `Couldn't read ${host}`, status: "failed", detail: result.notes[0] ?? "The site didn't return any readable pages." }
            );
          }
        } else {
          step({ id: "site", label: "No website yet", status: "skipped", detail: "Add it so we can learn what you sell and who to." });
        }

        // ── 2. What the site says ──
        const facts = await getClientFacts(id);
        const v = (k: string) => (facts[k] && facts[k].status !== "rejected" ? facts[k].value : undefined);
        const product = v("productIdentity") as { name?: string } | undefined;
        const siteIcps = Array.isArray(v("icps")) ? (v("icps") as ColdOpenIcp[]) : [];
        const voice = v("voiceProfile") as { tone?: string } | undefined;
        const [eng] = await db.select({ offer: engagements.offerDetails }).from(engagements).where(eq(engagements.engagementId, id)).limit(1);
        const showtime = eng?.offer ?? null;
        if (product?.name) step({ id: "found-product", label: `Product: ${product.name}`, status: "done" });
        else if (showtime?.name) step({ id: "found-product", label: `Product: ${showtime.name}, from Showtime`, status: "reused" });
        else step({ id: "found-product", label: "Couldn't tell what you sell from the site", status: "failed", detail: "Type it in on the next screen." });
        if (siteIcps.length) step({ id: "found-icps", label: plural(siteIcps.length, "likely buyer group"), status: "done" });
        else if (showtime?.icp) step({ id: "found-icps", label: `Buyers: ${showtime.icp}, from Showtime`, status: "reused" });
        if (voice?.tone) step({ id: "found-voice", label: "Your tone of voice", status: "done" });

        // ── 3. The sending platform: what they sent and what worked ──
        const config = await getColdOpenConfig(id);
        const platform = await connectedPlatform(id, config?.sendPlatform?.platform ?? null);
        let campaigns: { id: string; name: string }[] = [];
        if (platform) {
          const label = platformLabel(platform);
          try {
            const key = await resolveCredential(id, sendProvider(platform));
            const baseUrl = config?.sendPlatform?.platform === platform ? config.sendPlatform.baseUrl : undefined;
            const intel = await pullSender(platform, key, baseUrl);
            const outbound = await summarizeOutbound(intel);
            await upsertClientFact(id, "coldOpenSender", intel, { source: "account", sourceDetail: platform, evidence: `Read from ${label}.` });
            await upsertClientFact(id, "coldOpenOutbound", outbound, { source: "account", sourceDetail: platform, evidence: `Read from ${label}.` });
            campaigns = intel.campaigns.map((c) => ({ id: c.id, name: c.name }));

            step({
              id: "account-campaigns",
              label: `${label}: ${plural(intel.campaigns.length, "campaign")}${outbound.overallReplyRate != null ? `, ${outbound.overallReplyRate}% replied` : ""}`,
              status: intel.campaigns.length ? "done" : "skipped",
            });
            if (intel.mailboxes.length) {
              step({ id: "account-mailboxes", label: `${intel.mailboxes.length} ${intel.mailboxes.length === 1 ? "mailbox" : "mailboxes"}${outbound.capacity != null ? `, ${outbound.capacity} emails a day` : ""}`, status: "done" });
            }
            const subjects = rankSubjects(intel.steps, intel.campaigns, 20).filter((s) => platformSubject(s.subject));
            if (subjects.length) step({ id: "account-subjects", label: `${plural(subjects.length, "subject line")} you can reuse`, status: "done" });
            const sequences = touchsetsFromSteps(intel.steps, intel.campaigns, 8);
            const usable = sequences.filter((t) => importTouchset(t)).length;
            if (sequences.length) step({ id: "account-emails", label: `${usable} of ${plural(sequences.length, "email sequence")} ready to send as written`, status: usable ? "done" : "skipped" });
            const bad = outbound.domains.filter((d) => !d.ok);
            if (outbound.domains.length) {
              step(
                bad.length
                  ? { id: "account-dns", label: `${plural(bad.length, "sending domain")} missing email records`, status: "failed", detail: bad.map((d) => d.domain).join(", ") }
                  : { id: "account-dns", label: `${plural(outbound.domains.length, "sending domain")} set up right`, status: "done" }
              );
            }
            if (intel.coverage.blocked.length) {
              step({ id: "account-blocked", label: `${label} key can't read ${intel.coverage.blocked.join(", ")}`, status: "skipped" });
            }
          } catch (err) {
            console.warn(`[setup/cold-open/activate] ${platform} read failed for ${id}:`, err instanceof Error ? err.message : err);
            step({ id: "account-campaigns", label: `Couldn't read ${label}`, status: "failed", detail: "Check the key is current. Everything else still works." });
          }
        } else {
          step({ id: "account-campaigns", label: "No sending tool connected", status: "skipped", detail: "Connect it to learn from your past campaigns." });
        }

        // ── 4. Who really bought, from the CRM ──
        if (await hasCredential(id, "hubspot")) {
          try {
            const { profile } = await pullHubSpotBuyers(await resolveCredential(id, "hubspot"));
            if (profile) {
              await upsertClientFact(id, "coldOpenBuyers", profile, { source: "account", sourceDetail: "hubspot", evidence: `${profile.companies} companies behind ${profile.wonDeals} won deals in HubSpot.` });
              step({ id: "account-crm", label: `HubSpot: ${plural(profile.companies, "customer")} from won deals`, status: "done" });
            } else {
              step({ id: "account-crm", label: "HubSpot: no won deals with a company to learn from", status: "skipped" });
            }
          } catch (err) {
            console.warn(`[setup/cold-open/activate] HubSpot buyers failed for ${id}:`, err instanceof Error ? err.message : err);
            step({ id: "account-crm", label: "Couldn't read HubSpot deals", status: "failed" });
          }
        }

        // ── 5. Jev matches each buyer group to one of their campaigns ──
        const icps = config?.icps.length ? config.icps : siteIcps;
        const unmapped = icps.filter((i) => !config?.campaignMap[i.slug]);
        if (unmapped.length && campaigns.length) {
          const matches = await matchCampaigns(id, unmapped, campaigns);
          const n = matches ? Object.values(matches).filter(Boolean).length : 0;
          step({ id: "match-campaigns", label: n ? `Matched ${plural(n, "buyer group")} to a campaign` : "No campaign fits a buyer group yet", status: n ? "done" : "skipped" });
        }

        send({ type: "done" });
      } catch (err) {
        console.error(`[setup/cold-open/activate] ${id}:`, err);
        send({ type: "error", error: "Something went wrong while setting up. What was found so far is kept." });
      } finally {
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
