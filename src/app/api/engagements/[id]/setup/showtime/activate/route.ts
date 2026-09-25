import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { engagements, type EngagementStack } from "@/models/schema";
import { getClientFact, getClientFacts } from "@/lib/client-facts";
import { getPrimaryDomainForEngagement, seedPrimaryDomainFromUrl } from "@/lib/client-profile";
import { discoverClient } from "@/lib/discover-client";
import { isSiteReadReusable, wantsFreshRead } from "@/lib/site-read";
import { hasCredential, listVaultCredentials } from "@/lib/credentials";
import { verticalLabel } from "@/lib/verticals";
import { SHOWTIME_TOOL_GROUPS, SHOWTIME_TOOLS, findShowtimeTool } from "@/lib/showtime-setup/catalog";
import { showtimePickTargets } from "@/lib/showtime-setup/picks";
import { SHOWTIME_SKILLS, needsFor } from "@/lib/showtime-setup/skills";
import { checkAccountMatches, checkSite, matchSavedConnection, pickShowtimeIds } from "@/lib/showtime-setup/jev-setup";
import { PICK_SLOT_META, type ActivationStep, type PickSlot } from "@/lib/showtime-setup/types";
import { INTEL_PROVIDERS, runAccountIntel, runAccountReadings } from "@/lib/account-intel";
import { intelSteps } from "@/lib/showtime-setup/intel-steps";
import { ghlLocationIdOf, isGhlProvider, loadStack } from "@/lib/ghl-location";
import { authorizeShowtimeSetup } from "../access";

export const runtime = "nodejs";
export const revalidate = 0;
// A first read of a site (Firecrawl, then Claude and Jev over the copy)
// and of every connected account takes a while; reused reads return in a
// second or two.
export const maxDuration = 300;

function countLabel(n: number, noun: string): string | null {
  return n > 0 ? `${n} ${noun}${n === 1 ? "" : "s"}` : null;
}

function countOf(fact: { value: unknown; status: string } | undefined, noun: string): string | null {
  return fact && fact.status !== "rejected" && Array.isArray(fact.value) ? countLabel(fact.value.length, noun) : null;
}

function bareHost(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  try {
    return new URL(v.startsWith("http") ? v : `https://${v}`).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Showtime's "Activate": uses the website and whatever tools are connected
 * to do the setup work, streaming one NDJSON line per real step as it
 * finishes ({ type: "step", step }), then { type: "done" }. Every step is
 * reported only once its data actually exists; nothing is staged for show.
 *
 * Writes only suggestions (client_facts) and the shared domain. The
 * client's Showtime config changes when the person saves the review.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await authorizeShowtimeSetup(id, { requireInstalled: true });
  if (!access.ok) return access.response;

  const body = (await req.json().catch(() => ({}))) as { domain?: unknown; skills?: unknown };
  // Which skills the person switched on; only their ids get picked. No list
  // means every skill (older callers).
  const skills = Array.isArray(body.skills) ? body.skills.filter((s): s is string => typeof s === "string") : SHOWTIME_SKILLS.map((s) => s.id);
  const needs = needsFor(skills);
  // "Read again": crawl the site and pull every connected tool fresh,
  // skipping both caches.
  const force = wantsFreshRead(body);
  const typed = typeof body.domain === "string" ? body.domain : "";
  const typedHost = bareHost(typed);
  if (typed.trim() && !typedHost) {
    return NextResponse.json({ error: "That doesn't look like a website address." }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (line: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
      const step = (s: ActivationStep) => send({ type: "step", step: s });

      try {
        // ── 1. The website ──
        const before = await getPrimaryDomainForEngagement(id);
        if (typedHost && bareHost(before ?? "") !== typedHost) {
          await seedPrimaryDomainFromUrl(id, typedHost);
        }
        const domain = (await getPrimaryDomainForEngagement(id)) ?? typedHost;
        const host = bareHost(domain ?? "");
        if (!host && needs.website) {
          step({ id: "site", label: "No website to read", status: "failed", detail: "The confirmation page is built from the website. Add it, or switch that skill off." });
          send({ type: "done" });
          controller.close();
          return;
        }

        // Reuse a recent read of this same site (from any product) instead
        // of crawling it again, unless the person asked to read it again.
        const corpus = host ? await getClientFact(id, "rawVoiceCorpus") : null;
        const alreadyRead = isSiteReadReusable({ corpus, sameHost: bareHost(corpus?.sourceDetail ?? "") === host, force });
        if (!host) {
          // Nothing switched on needs the site; the tools carry the rest.
        } else if (alreadyRead && corpus) {
          step({ id: "site", label: `Already read ${host}`, status: "reused", detail: corpus.updatedAt.toISOString() });
        } else {
          const result = await discoverClient(id);
          if (!result.ran || !result.factsWritten.includes("rawVoiceCorpus")) {
            step({ id: "site", label: `Couldn't read ${host}`, status: "failed", detail: result.notes[0] ?? "The site didn't return any readable pages." });
          } else {
            step({ id: "site", label: `Read ${host}`, status: "done" });
          }
        }

        const siteCheck = host ? await checkSite(id, host) : null;
        if (siteCheck && !siteCheck.isRealSite) {
          step({ id: "site-check", label: "This may not be the main website", status: "failed", detail: "It reads like a link page, a login or a placeholder. Double-check the address." });
        }

        // ── 2. What the site says ──
        const facts = await getClientFacts(id);
        const text = (key: string) => (typeof facts[key]?.value === "string" && (facts[key].value as string).trim() ? (facts[key].value as string) : null);
        const found: [string, string | null][] = [
          ["offer", text("offerName") && `Offer: ${text("offerName")}`],
          ["price", text("offerPrice") && `Price: ${text("offerPrice")}`],
          ["icp", text("offerIcp") && "Who it's for"],
          ["vertical", text("offerVertical") && `Industry: ${verticalLabel(text("offerVertical"))}`],
          ["voice", facts.rawVoiceCorpus ? "Brand voice" : null],
          ["design", facts.designSignal ? "Brand colors and fonts" : null],
          ["video", text("heroVideoUrl") && "Video on your homepage"],
          ["booking-seen", facts.bookingPlatform?.source === "website" ? `${findShowtimeTool(String(facts.bookingPlatform.value), "booking")?.label ?? "Booking tool"} on your site` : null],
          ["email-seen", typeof facts.siteEmailPlatformHint?.value === "string" ? `${findShowtimeTool(String(facts.siteEmailPlatformHint.value), "email")?.label ?? "Email tool"} on your site` : null],
          ["testimonials", countOf(facts.siteTestimonials, "testimonial")],
          ["faqs", countOf(facts.siteFaqs, "FAQ")],
          ["objections", countOf(facts.siteObjections, "objection")],
          ["offers", countOf(facts.offerTiers, "offer")],
          ["socials", facts.socialProfiles && typeof facts.socialProfiles.value === "object" ? countLabel(Object.keys(facts.socialProfiles.value as object).length, "social profile") : null],
          ["pages", facts.siteCrawl ? countLabel(((facts.siteCrawl.value as { pages?: unknown[] }).pages ?? []).length, "page") + " read" : null],
        ];
        for (const [key, label] of found) if (label) step({ id: `found-${key}`, label, status: "done" });

        // ── 3. Tools ──
        const vault = await listVaultCredentials(access.workspaceId);
        for (const t of SHOWTIME_TOOLS) {
          const saved = vault.filter((v) => v.provider === t.provider);
          if (saved.length > 1) await matchSavedConnection(id, host || null, t.provider, saved);
        }
        let ghlAsked = false;
        for (const t of SHOWTIME_TOOLS) {
          if (!t.needsKey || !(await hasCredential(id, t.provider))) continue;
          const label = vault.find((v) => v.provider === t.provider)?.label ?? null;
          if (isGhlProvider(t.provider) && !ghlLocationIdOf(await loadStack(id))) {
            if (!ghlAsked) {
              ghlAsked = true;
              step({
                id: "account-ghl-location",
                label: "GoHighLevel needs its Location ID",
                status: "failed",
                detail: "Tap the GoHighLevel logo and add it once. Every skill reads your calendars and workflows through it.",
              });
            }
            continue;
          }
          const check = await checkAccountMatches(id, host || null, t.provider, label);
          if (check && !check.matches) {
            step({ id: `account-${t.provider}`, label: `${t.label} may be a different business's account`, status: "failed", detail: "Check it's the right account before turning Showtime on." });
          } else {
            step({ id: `account-${t.provider}`, label: `${t.label} connected`, status: "done" });
          }
        }

        // ── 3b. What the accounts have done ──
        // Bookings, attendance, what prospects wrote, deals, emails,
        // automations: every connected tool read in parallel. GoHighLevel's
        // booking and CRM sides are one account, read once.
        const connected: (typeof INTEL_PROVIDERS)[number][] = [];
        for (const p of INTEL_PROVIDERS) if (await hasCredential(id, p)) connected.push(p);
        const toRead = connected.filter((p) => !(p === "ghl" && connected.includes("ghl_calendar")));
        const runs = await Promise.all(toRead.map((p) => runAccountIntel(id, p, { force })));
        for (const run of runs) {
          if (!run.intel) continue;
          for (const s of intelSteps(run.intel, findShowtimeTool(run.provider)?.label ?? run.provider)) step(s);
        }
        if (runs.some((r) => r.intel)) {
          await runAccountReadings(id);
          const read = await getClientFact(id, "businessBrief");
          if (read && read.status !== "rejected") step({ id: "account-read", label: "Read your business from your tools", status: "done" });
        }

        // Nothing is promoted into config here: what was found is shown in
        // the review, and applied when the person presses Save.

        // ── 4. Account-specific ids ──
        const [row] = await db.select({ stack: engagements.stack }).from(engagements).where(eq(engagements.engagementId, id)).limit(1);
        const stack = ((row?.stack as Partial<EngagementStack> | null) ?? {}) as Partial<EngagementStack>;
        const latest = await getClientFacts(id);
        const chosen = async (group: "email" | "hosting", saved: string | undefined, factKey: string): Promise<string | null> => {
          if (saved) return saved;
          for (const t of SHOWTIME_TOOL_GROUPS.find((g) => g.id === group)!.tools) {
            if (t.needsKey && (await hasCredential(id, t.provider))) return t.provider;
          }
          const f = latest[factKey];
          return f && f.status !== "rejected" && typeof f.value === "string" ? f.value : null;
        };
        const targets = showtimePickTargets({
          emailPlatform: await chosen("email", stack.email_platform, "emailPlatform"),
          hostingPlatform: await chosen("hosting", stack.hosting_platform, "hostingPlatform"),
          activecampaignBaseUrl: stack.activecampaign_base_url ?? null,
          ghlLocationId: ghlLocationIdOf(stack),
        }).filter((t) => {
          // Already set in config: nothing to pick. Skills switched off get
          // their picks too, so switching one on later finds them ready
          // instead of asking again; only the ones switched on are saved.
          const meta = (stack.hosting_platform_meta ?? {}) as Record<string, unknown>;
          const current = t.slot === "webflow_site_id" || t.slot === "vercel_project_name" ? meta[t.slot] : (stack as Record<string, unknown>)[t.slot];
          return !current;
        });
        const picks = await pickShowtimeIds(id, host || null, targets);
        for (const p of picks) {
          // Ready for a skill that's off: nothing to show until it's on.
          if (!needs.picks.has(p.slot as PickSlot)) continue;
          const label = PICK_SLOT_META[p.slot as PickSlot]?.label ?? p.slot;
          step(
            p.picked
              ? { id: `pick-${p.slot}`, label: `${label}: ${p.picked.name}`, status: "done" }
              : { id: `pick-${p.slot}`, label: `${label}: nothing fits yet`, status: "skipped", detail: "Pick one, or we'll leave it for later." }
          );
        }

        send({ type: "done" });
      } catch (err) {
        console.error(`[setup/showtime/activate] ${id}:`, err);
        send({ type: "error", error: "Something went wrong while setting up. What was found so far is kept." });
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed after an early return.
        }
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
