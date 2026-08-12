import Link from "next/link";
import { SKILLS, SKILL_INFO, WORKSPACE_PRODUCTS } from "@/lib/copy";
import { Webhook, KeyRound, ArrowUpRight, LayoutGrid, Gavel, Lock } from "lucide-react";

export const dynamic = "force-dynamic";

const SETUP_GUIDES = [
  {
    title: "Calendly & Cal.com",
    body: "Fully automatic. Paste your API key in Settings → Credentials and a push webhook subscription is registered for you during onboarding — nothing else to configure.",
  },
  {
    title: "GoHighLevel",
    body: "GHL's v2 Private Integration API has no endpoint to create webhooks programmatically, so onboarding starts you on 5-minute auto-polling. Head to Settings → Booking Sync any time to switch to a direct webhook — it walks through adding a Custom Webhook action to a GHL workflow, including the exact header GHL needs.",
  },
  {
    title: "OnceHub",
    body: "Same story as GHL today: auto-polling by default, with step-by-step instructions in Settings → Booking Sync to add a webhook from OnceHub's own interface. OnceHub's Developer Center now describes a webhooks API that returns a signing_secret directly, similar to Calendly/Cal.com — worth checking their current docs if you want fully automatic setup, since that wasn't available when this fallback was originally built.",
  },
];

// Matches the badge icon per product id used on /home's product picker
// (ProductSquishyBadge in home/page.tsx) — same visual identity, smaller.
function ProductIcon({ productId }: { productId: string }) {
  if (productId === "counter-claim") {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-400 dark:bg-amber-500 shadow-xs select-none">
        <Gavel size={15} className="text-zinc-950 stroke-[2.3px] fill-white" strokeLinecap="round" strokeLinejoin="round" />
      </div>
    );
  }
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-500 dark:bg-teal-400 shadow-xs select-none">
      <LayoutGrid size={15} className="text-zinc-950 stroke-[2.3px] fill-white" strokeLinecap="round" strokeLinejoin="round" />
    </div>
  );
}

/**
 * Observation 8 fix (2026-08-05 handoff) — Library is the workspace-level
 * agent marketplace: what's available to use, browsable per product,
 * before you've enabled or connected anything for a specific client.
 * (Per-client skill status lives on the engagement page instead — see
 * that page's Skills panel — and cross-client aggregate status lives on
 * Analytics/the Needs Action queue. This page isn't trying to be either
 * of those; see the old SKILL STATUS sidebar panel this replaced, deleted
 * per this same observation.)
 *
 * Structured around WORKSPACE_PRODUCTS (the same product list /home's
 * picker uses) rather than hardcoding Showtime, so a second product
 * shows up here the moment it's real — no blank scaffolding built ahead
 * of that. Today that's just Showtime (available) + Counter Claim
 * (coming soon, matching /home's own "coming soon" treatment) — nothing
 * fabricated for Counter Claim beyond what /home already commits to.
 */
export default function LibraryPage() {
  const showtime = WORKSPACE_PRODUCTS.find((p) => p.id === "showtime");
  const comingSoon = WORKSPACE_PRODUCTS.filter((p) => p.status !== "available");

  return (
    <div className="w-full space-y-8 px-6 py-6 transition-colors duration-200">
      <div>
        <h1 className="text-xl tracking-tight" style={{ color: "var(--text-primary)", fontWeight: 700 }}>
          Library
        </h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
          Every skill available in your workspace, grouped by product.
        </p>
      </div>

      {showtime && (
        <div className="space-y-3">
          <div className="flex items-center gap-2.5">
            <ProductIcon productId={showtime.id} />
            <div>
              <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{showtime.name}</h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-500">{showtime.description}</p>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {SKILLS.map((skill) => (
              <Link
                key={skill}
                href={`/dashboard/modules/${skill}`}
                className="group rounded-xl border border-zinc-200 dark:border-zinc-900 bg-white dark:bg-zinc-900/40 p-4 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{SKILL_INFO[skill].name}</p>
                  <ArrowUpRight size={14} className="text-zinc-300 dark:text-zinc-700 group-hover:text-zinc-500 dark:group-hover:text-zinc-400 transition-colors" />
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-1 leading-relaxed">
                  {SKILL_INFO[skill].description}
                </p>
              </Link>
            ))}
          </div>

          <div className="space-y-3 pt-2">
            <h3 className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider font-mono">
              Booking platform setup
            </h3>
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-900 bg-white dark:bg-zinc-900/40 divide-y divide-zinc-200 dark:divide-zinc-900">
              {SETUP_GUIDES.map((guide) => (
                <div key={guide.title} className="px-4 py-4 flex items-start gap-3">
                  <Webhook size={15} className="text-zinc-400 dark:text-zinc-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{guide.title}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-0.5 leading-relaxed">{guide.body}</p>
                  </div>
                </div>
              ))}
            </div>
            <Link
              href="/dashboard/settings?tab=booking-sync"
              className="inline-flex items-center gap-1.5 text-xs font-mono text-zinc-500 dark:text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300 transition-colors"
            >
              <KeyRound size={12} />
              Go to Settings → Booking Sync
            </Link>
          </div>
        </div>
      )}

      {comingSoon.map((product) => (
        <div key={product.id} className="space-y-3">
          <div className="flex items-center gap-2.5 opacity-60">
            <ProductIcon productId={product.id} />
            <div>
              <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{product.name}</h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-500">{product.description}</p>
            </div>
          </div>
          <div className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/20 p-6 flex items-center gap-2.5 text-xs text-zinc-500 dark:text-zinc-500">
            <Lock size={13} />
            Coming soon — skills will appear here once {product.name} ships.
          </div>
        </div>
      ))}
    </div>
  );
}
