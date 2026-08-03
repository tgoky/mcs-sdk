import { getSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { LayoutGrid, Gavel } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { HOME_COPY, WORKSPACE_PRODUCTS, type WorkspaceProduct } from "@/lib/copy";

// Rendered fresh on every request — session-scoped, never statically cached.
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Asana-Style Squishy Product Identity Icon Badges
 */
function ProductSquishyBadge({ productId }: { productId: string }) {
  if (productId === "counter-claim") {
    return (
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-400 dark:bg-amber-500 shadow-xs select-none">
        <Gavel
          size={20}
          className="text-zinc-950 stroke-[2.3px] fill-white"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </div>
    );
  }

  // Default / Showtime
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-teal-500 dark:bg-teal-400 shadow-xs select-none">
      <LayoutGrid
        size={20}
        className="text-zinc-950 stroke-[2.3px] fill-white"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </div>
  );
}

function ProductCard({ product }: { product: WorkspaceProduct }) {
  const isAvailable = product.status === "available";

  const card = (
    <div
      className={`group flex h-full flex-col justify-between rounded-2xl border p-6 transition-all duration-200 select-none ${
        isAvailable
          ? "border-zinc-200/90 bg-white/80 hover:-translate-y-1 hover:border-zinc-300 hover:shadow-md dark:border-zinc-800/90 dark:bg-zinc-900/60 dark:hover:border-zinc-700 dark:hover:bg-zinc-900/80 backdrop-blur-xs"
          : "border-zinc-200/60 bg-zinc-50/50 opacity-75 dark:border-zinc-800/40 dark:bg-zinc-950/20"
      }`}
    >
      <div className="space-y-5">
        {/* Card Header: Squishy Icon */}
        <div className="flex items-center justify-between gap-3">
          <ProductSquishyBadge productId={product.id} />

          {/* Status pill shown only when NOT available */}
          {!isAvailable && (
            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-[11px] font-bold tracking-tight border border-zinc-200 bg-zinc-100 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-500">
              {HOME_COPY.statusLabels[product.status]}
            </span>
          )}
        </div>

        {/* Product Details */}
        <div className="space-y-1.5">
          <h2 className="text-base font-bold tracking-tight text-zinc-900 dark:text-zinc-100 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
            {product.name}
          </h2>
          <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400 font-sans">
            {product.description}
          </p>
        </div>
      </div>

      {/* Action Footer Button */}
      <div className="pt-6">
        {isAvailable ? (
          <Button className="w-full cursor-pointer bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200 font-bold text-xs shadow-xs transition-all">
            <span>{HOME_COPY.openLabel} {product.name}</span>

          </Button>
        ) : (
          <Button variant="outline" disabled className="w-full font-medium text-xs opacity-60">
            {HOME_COPY.comingSoonLabel}
          </Button>
        )}
      </div>
    </div>
  );

  if (!isAvailable) {
    return card;
  }

  return (
    <Link href={product.href} prefetch={false} className="block h-full">
      {card}
    </Link>
  );
}

export default async function WorkspaceHomePage() {
  const session = await getSession();
  const displayName = session.email?.split("@")[0] ?? "there";
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <div className="relative min-h-screen bg-zinc-50/50 font-sans text-zinc-600 antialiased dark:bg-zinc-950 dark:text-zinc-400 transition-colors duration-200 overflow-hidden">
      
      {/* --- HIGH-DENSITY TIGHT MICRO DOT GRID OVERLAY --- */}
      <div 
        className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(#cbd5e1_0.8px,transparent_0.8px)] dark:bg-[radial-gradient(#27272a_0.8px,transparent_0.8px)] [background-size:10px_10px] [mask-image:radial-gradient(ellipse_75%_75%_at_50%_30%,#000_60%,transparent_100%)] opacity-80" 
        aria-hidden="true"
      />

      {/* --- MAIN PAGE CONTENT --- */}
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-8 sm:px-10 lg:px-12">

        {/* Asana Header Bar */}
        <header className="flex items-center justify-between gap-4 border-b border-zinc-200/80 pb-5 dark:border-zinc-800/80">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-600 dark:bg-teal-500 text-xs font-bold text-white font-mono shadow-2xs">
              {initials}
            </div>
            <div className="space-y-0.5">
              <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                {HOME_COPY.eyebrow}
              </p>
              <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
                Welcome back, {displayName}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link
              href="/api/auth/logout"
              prefetch={false}
              className="font-mono text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200 px-2 py-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-900"
            >
              {HOME_COPY.signOut}
            </Link>
          </div>
        </header>

        {/* Products Grid */}
        <main className="flex-1 py-10">
          <div className="mb-8 space-y-1">
            <div className="flex items-center gap-1.5">
              <h1 className="font-mono text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                {HOME_COPY.title}
              </h1>
            </div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 font-medium">
              {HOME_COPY.subtitle}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {WORKSPACE_PRODUCTS.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </main>

        {/* Footer */}
        <footer className="border-t border-zinc-200/80 pt-6 dark:border-zinc-800/80">
          <p className="font-mono text-xs text-zinc-400 dark:text-zinc-600">
            {HOME_COPY.footerNote}
          </p>
        </footer>
      </div>
    </div>
  );
}