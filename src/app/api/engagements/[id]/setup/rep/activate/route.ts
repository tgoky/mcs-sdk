import crypto from "crypto";
import { NextResponse } from "next/server";
import { getClientFact, getClientFacts, upsertClientFact } from "@/lib/client-facts";
import { getPrimaryDomainForEngagement, seedPrimaryDomainFromUrl } from "@/lib/client-profile";
import { discoverClient } from "@/lib/discover-client";
import { hasCredential } from "@/lib/credentials";
import { finishRun, startRun, emptySummary } from "@/lib/run-log";
import { factTier } from "@/lib/fact-trust";
import { INTEL_PROVIDERS, runAccountIntel } from "@/lib/account-intel";
import { findGoogleListing } from "@/features/reputation-manager/server/outscraper-google";
import { resolveOutscraperConfig } from "@/features/reputation-manager/trustpilot-config";
import type { RepEngineId, RepGoogleListing } from "@/models/schema";
import { REP_ENGINE_IDS } from "@/features/reputation-manager/engine-models";
import { buildRepProposal, hostOf, type SavedGraph } from "@/lib/rep-setup/proposal";
import { decideRepIdentity } from "@/lib/rep-setup/jev";
import { runFirstLook } from "@/lib/rep-setup/first-look";
import { loadRepGraph, toolLabel } from "@/lib/rep-setup/state";
import type { ActivationStep } from "@/lib/showtime-setup/types";
import { authorizeProductSetup } from "../../showtime/access";

export const runtime = "nodejs";
export const revalidate = 0;
// A first site read, the tools, Google, Jev and the first look together.
export const maxDuration = 300;

const WATCH_SKILLS = ["rep-engine-panel", "rep-trustpilot-watch", "rep-reddit-watch", "rep-twitter-watch", "rep-google-reviews-watch", "rep-news-watch", "rep-search-watch"];
const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;
const count = (v: unknown) => (Array.isArray(v) ? v.length : v && typeof v === "object" ? Object.keys(v).length : 0);

/**
 * Reputation Manager's "Set it up": gathers every name the watches should
 * search for (site, connected tools, Whop), finds the Google listing, has
 * Jev sort the uncertain names, then takes a first look at where the
 * reputation stands. Streams one NDJSON line per finished step.
 *
 * Writes suggestions only (client_facts); the identity graph changes when
 * the person saves the review.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await authorizeProductSetup(id, "reputation-manager", { requireInstalled: true });
  if (!access.ok) return access.response;

  const body = (await req.json().catch(() => ({}))) as { domain?: unknown; skills?: unknown };
  const skills = Array.isArray(body.skills) ? body.skills.filter((s): s is string => typeof s === "string") : WATCH_SKILLS;
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
          } else {
            const result = await discoverClient(id);
            step(
              result.ran && result.factsWritten.includes("rawVoiceCorpus")
                ? { id: "site", label: `Read ${host}`, status: "done" }
                : { id: "site", label: `Couldn't read ${host}`, status: "failed", detail: result.notes[0] ?? "The site didn't return any readable pages." }
            );
          }
        } else {
          step({ id: "site", label: "No website yet", status: "skipped", detail: "Add it to find more names, socials and your Google listing." });
        }

        // ── 2. Names from the site ──
        let facts = await getClientFacts(id);
        const v = (k: string) => (facts[k] && facts[k].status !== "rejected" ? facts[k].value : undefined);
        const founder = v("founder") as { name?: string } | undefined;
        const found: [string, string | null][] = [
          ["name", typeof v("operatorName") === "string" ? `Name: ${v("operatorName")}` : null],
          ["founder", founder?.name ? `Founder: ${founder.name}` : null],
          ["socials", count(v("socialProfiles")) ? plural(count(v("socialProfiles")), "social profile") : null],
          ["brands", count(v("entities")) ? plural(count(v("entities")), "brand") : null],
          ["offers", count(v("offerTiers")) ? plural(count(v("offerTiers")), "offer") : null],
          ["press", count(v("pressMentions")) ? plural(count(v("pressMentions")), "press mention") : null],
          ["competitors", count(v("competitors")) ? plural(count(v("competitors")), "competitor") : null],
          ["lookalikes", count(v("collisions")) ? plural(count(v("collisions")), "same-name lookalike") : null],
        ];
        for (const [key, label] of found) if (label) step({ id: `found-${key}`, label, status: "done" });

        // ── 3. Connected tools: more names (read once per client, any product) ──
        const connected: (typeof INTEL_PROVIDERS)[number][] = [];
        for (const p of INTEL_PROVIDERS) if (await hasCredential(id, p)) connected.push(p);
        const toRead = connected.filter((p) => !(p === "ghl" && connected.includes("ghl_calendar")));
        const runs = await Promise.all(toRead.map((p) => runAccountIntel(id, p)));
        for (const r of runs) {
          if (!r.intel) continue;
          const names = [r.intel.business?.name, r.intel.sender?.fromName, ...(r.intel.booking?.history.hosts ?? []).map((h) => h.name)].filter(Boolean);
          step({ id: `account-${r.provider}`, label: `${toolLabel(r.provider)}: ${names.length ? plural(new Set(names).size, "name") : "read"}`, status: "done" });
        }
        if (await hasCredential(id, "whop_bot_api_key")) {
          const plans = count(v("whopPlanOptions"));
          step({ id: "account-whop", label: plans ? `Whop: ${plural(plans, "product")}` : "Whop connected", status: "done" });
        }

        // ── 4. The Google listing, only when its website is theirs ──
        const graph = await loadRepGraph(id);
        let listing: RepGoogleListing | null = graph?.googleListing ?? null;
        if (!listing && host && resolveOutscraperConfig()) {
          const name = (typeof v("operatorName") === "string" ? (v("operatorName") as string) : "") || access.buyer;
          try {
            listing = (await findGoogleListing({ name, domain: host })) ?? (await findGoogleListing({ name: host, domain: host }));
          } catch (err) {
            console.warn(`[setup/rep/activate] Google listing search failed for ${id}:`, err instanceof Error ? err.message : err);
          }
          if (listing) {
            await upsertClientFact(id, "googleListing", listing, { source: "website", sourceDetail: "google-maps", evidence: `Google Maps listing whose website is ${host}.` });
          }
        }
        step(
          listing
            ? { id: "account-google", label: `Google: ${listing.rating ?? "?"}★${listing.reviews != null ? ` from ${listing.reviews} reviews` : ""}`, status: "done" }
            : { id: "account-google", label: "No Google listing matches your website", status: "skipped", detail: "Google Reviews Watch stays off until there is one." }
        );

        // ── 5. Jev sorts the uncertain names ──
        facts = await getClientFacts(id);
        const saved: SavedGraph | null = graph && graph.operatorName.trim() ? { ...graph, googleListing: graph.googleListing ?? null } : null;
        const draft = buildRepProposal({ buyer: access.buyer, primaryDomain: host, saved, facts, decisions: null, tierOf: factTier, toolLabel });
        const decisions = await decideRepIdentity(id, draft, host);
        if (decisions) {
          const n = Object.values(decisions).reduce((sum, g) => sum + Object.keys(g ?? {}).length, 0);
          step({ id: "account-jev", label: `Jev checked ${plural(n, "name")}`, status: "done" });
        }

        // ── 6. A first look, when anything is being watched ──
        if (skills.some((s) => WATCH_SKILLS.includes(s))) {
          const proposal = buildRepProposal({ buyer: access.buyer, primaryDomain: host, saved, facts, decisions, tierOf: factTier, toolLabel });
          const runId = crypto.randomUUID();
          await startRun({ id: runId, engagementId: id, skillName: "rep-onboarding", phase: "first_look", label: access.buyer });
          const look = await runFirstLook({
            engagementId: id,
            runId,
            who: { names: [proposal.operatorName.value, ...proposal.aliases.filter((a) => a.on).map((a) => a.value)].slice(0, 8), domains: proposal.domains.filter((d) => d.on).map((d) => d.value) },
            listing,
            prompt: proposal.seedPrompts[0]?.value ?? `What do people say about ${proposal.operatorName.value}?`,
            engines: (graph?.activeEngines as RepEngineId[] | null) ?? REP_ENGINE_IDS,
          });
          const summary = emptySummary();
          summary.whatWorked.push("Took a first look at the client's reputation during setup.");
          await finishRun(runId, { summary }).catch(() => {});
          if (look.google) step({ id: "look-google", label: look.google.unansweredNegative ? `${plural(look.google.unansweredNegative, "bad Google review")} with no reply` : "Google reviews checked", status: look.google.unansweredNegative ? "failed" : "done" });
          if (look.reddit) step({ id: "look-reddit", label: `Reddit: ${plural(look.reddit.mentions, "mention")} this month`, status: "done" });
          if (look.x) step({ id: "look-x", label: `X: ${plural(look.x.mentions, "mention")} this month`, status: "done" });
          if (look.news) step({ id: "look-news", label: `News: ${plural(look.news.articles, "article")} this month`, status: "done" });
          if (look.search) {
            const risky = look.search.results.filter((r) => r.risky).length;
            step({ id: "look-search", label: risky ? `${plural(risky, "worrying page")} on Google's first page` : "Google's first page looks clean", status: risky ? "failed" : "done" });
          }
          if (look.engines.length) step({ id: "look-engines", label: `${plural(look.engines.length, "AI engine")} asked`, status: "done" });
          for (const s of look.skipped) step({ id: `look-skip-${s}`, label: `Skipped ${s}`, status: "skipped" });
        }

        send({ type: "done" });
      } catch (err) {
        console.error(`[setup/rep/activate] ${id}:`, err);
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
