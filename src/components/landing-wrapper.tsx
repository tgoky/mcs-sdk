"use client";

import { useState } from "react";
import { EnterDashboardBtn } from "@/components/enter-dashboard-btn";
import { HeaderCtaBtn } from "@/components/header-cta-btn";
import { WORKSPACE_PRODUCTS } from "@/lib/copy";
import { workersForProduct } from "@/lib/worker-registry";
import type { ProductId } from "@/lib/product-catalog";

/**
 * Real product -> real skills, grouped by their actual category — this
 * used to be 4 hand-copy-pasted nav blocks with fabricated sub-item
 * copy ("AI Executive Summaries", "Retargeting Sync", ...) that matched
 * nothing in the app, and 3 of the app's real SKILLS (Booking Recovery,
 * Funnel Audit, Call Briefs) sitting as top-level items next to the 2
 * real PRODUCTS that happened to be listed, missing Cold Open and Whop
 * Agent entirely. Every skill lives inside its product's own dropdown
 * now, sourced from the same worker-registry.ts every other page in the
 * app reads — this can't drift out of sync with what's actually there.
 */
function productMegaMenu(productId: string) {
  const grouped = new Map<string, string[]>();
  for (const worker of workersForProduct(productId as ProductId)) {
    const bucket = grouped.get(worker.category) ?? [];
    bucket.push(worker.name);
    grouped.set(worker.category, bucket);
  }
  return Array.from(grouped.entries());
}

function ProductNavItem({ product }: { product: (typeof WORKSPACE_PRODUCTS)[number] }) {
  const categories = productMegaMenu(product.id);
  if (categories.length === 0) return null;

  return (
    <div className="relative group">
      <span className="px-3.5 py-1.5 rounded-sm text-zinc-300 group-hover:bg-white/10 group-hover:text-white transition-all duration-200 flex items-center gap-1.5 cursor-pointer select-none">
        {product.name}
        {product.status === "coming_soon" && (
          <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-zinc-500 border border-zinc-700 rounded px-1 py-0.5">
            Soon
          </span>
        )}
        <svg className="w-3 h-3 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:rotate-180 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
        </svg>
      </span>
      <div className="absolute top-full left-1/2 -translate-x-1/2 mt-3 w-[560px] bg-white/[0.04] backdrop-blur-2xl border border-white/10 rounded-sm p-7 shadow-2xl opacity-0 -translate-y-2 scale-[0.98] pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 group-hover:scale-100 group-hover:pointer-events-auto transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] z-50">
        <p className="text-xs text-zinc-400 mb-5 leading-relaxed">{product.description}</p>
        <div className="flex flex-wrap gap-x-8 gap-y-6">
          {categories.map(([category, names]) => (
            <div key={category} className="min-w-[130px]">
              <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-300 mb-4">{category}</div>
              <div className="space-y-3 text-sm text-zinc-100">
                {names.map((name) => (
                  <div key={name} className="hover:text-white transition-colors duration-200">
                    {name}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function LandingWrapper({
  destinationHref,
  getStartedHref,
  membershipRequired,
  hasWhopUser,
}: {
  destinationHref: string;
  getStartedHref: string;
  membershipRequired: boolean;
  hasWhopUser: boolean;
}) {
  const [isExiting, setIsExiting] = useState(false);

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-black text-white font-sans flex flex-col justify-between selection:bg-zinc-800">
      {/* Background Image Layer */}
      <div className="absolute inset-0 z-0">
        <img
          src="/images/new.jpeg"
          alt="Background"
          className={`w-full h-full object-cover object-center opacity-50 transition-all duration-700 ease-out ${
            isExiting ? "scale-125 blur-sm" : "scale-105"
          }`}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20" />
      </div>

      {/* Navigation Header */}
      <header className="relative z-30 w-full px-8 py-6 flex items-center justify-between">
   <div className="flex items-center z-10">
  <img
    src="/images/logo.png"
    alt="Unified Tools Platform"
    className="h-11 md:h-14 w-auto object-contain"
  />
</div>
        <nav className="hidden md:flex items-center gap-2 text-sm font-medium absolute left-1/2 -translate-x-1/2">
          {WORKSPACE_PRODUCTS.map((product) => (
            <ProductNavItem key={product.id} product={product} />
          ))}
        </nav>

        <HeaderCtaBtn href={getStartedHref} onNavigateStart={() => setIsExiting(true)}>
          Get Started
        </HeaderCtaBtn>
      </header>

      {/* Hero Body Content */}
      <main className="relative z-10 max-w-6xl w-full mx-auto px-8 md:px-12 my-auto py-24 flex flex-col items-start space-y-6">
        <h1 className={`text-5xl sm:text-7xl lg:text-8xl font-bold tracking-tight leading-[0.95] max-w-3xl text-white transition-all duration-700 ease-out ${
          isExiting ? "opacity-0 scale-105" : "opacity-100 scale-100"
        }`}>
         Your entire stack, unified.
        </h1>

        <p className={`text-lg sm:text-2xl text-zinc-300 max-w-xl font-normal leading-relaxed transition-all duration-500 ease-out ${
          isExiting ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0"
        }`}> 
         Access an expanding ecosystem of tools built to automate and scale your operations.
        </p>

        {membershipRequired && (
          <div className={`rounded-xl border border-amber-500/30 bg-amber-500/10 backdrop-blur-md p-4 max-w-md text-sm text-amber-200 space-y-1 transition-all duration-400 ease-out ${
            isExiting ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0"
          }`}>
            <div className="font-semibold text-amber-400">Membership Required</div>
            <p className="text-zinc-300 text-xs leading-normal">
              {hasWhopUser
                ? "Your account is active, but requires an active subscription."
                : "Please sign in to access your account."}
            </p>
          </div>
        )}

        <div className="relative z-50 pt-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full sm:w-auto">
          <EnterDashboardBtn
            href={destinationHref}
            onNavigateStart={() => setIsExiting(true)}
          >
            Enter Dashboard
          </EnterDashboardBtn>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full px-8 py-6 flex items-center justify-between text-xs text-zinc-400 border-t border-white/10 backdrop-blur-md bg-black/10">
        <div>© Mudd Ventures 2026</div>
      </footer>
    </div>
  );
}