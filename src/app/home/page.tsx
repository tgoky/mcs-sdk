import { getSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { LayoutGrid, ShieldAlert, ArrowRight } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { HOME_COPY, WORKSPACE_PRODUCTS, type WorkspaceProduct } from "@/lib/copy";

// Rendered fresh on every request — session-scoped, never statically cached.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const PRODUCT_ICONS: Record<string, React.ComponentType<{ className?: string; size?: number }>> = {
  showtime: LayoutGrid,
  "counter-claim": ShieldAlert,
};

function ProductCard({ product }: { product: WorkspaceProduct }) {
  const Icon = PRODUCT_ICONS[product.id] ?? LayoutGrid;
  const isAvailable = product.status === "available";

  const card = (
    <div
      className={`group flex h-full flex-col justify-between rounded-xl border p-6 transition-all duration-200 ${
        isAvailable
          ? "border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-xs dark:border-zinc-800 dark:bg-zinc-900/50 dark:hover:border-zinc-700"
          : "border-zinc-200/70 bg-zinc-50/50 opacity-75 dark:border-zinc-800/40 dark:bg-zinc-900/20"
      }`}
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
            <Icon size={18} />
          </div>
          <span
            className={`shrink-0 rounded-md border px-2.5 py-0.5 font-mono text-[11px] font-medium tracking-tight ${
              isAvailable
                ? "border-emerald-200/80 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-400"
                : "border-zinc-200 bg-zinc-100 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-500"
            }`}
          >
            {HOME_COPY.statusLabels[product.status]}
          </span>
        </div>

        <div className="space-y-1.5">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            {product.name}
          </h2>
          <p className="text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
            {product.description}
          </p>
        </div>
      </div>

      <div className="pt-6">
        {isAvailable ? (
          <Button className="w-full cursor-pointer bg-zinc-900 text-zinc-50 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 font-medium">
            {HOME_COPY.openLabel} {product.name}
            <ArrowRight size={15} className="ml-1 transition-transform group-hover:translate-x-0.5" />
          </Button>
        ) : (
          <Button variant="outline" disabled className="w-full font-medium">
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

  return (
    <div className="min-h-screen bg-zinc-50/50 font-sans text-zinc-600 antialiased dark:bg-zinc-950 dark:text-zinc-400">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-8 sm:px-10 lg:px-12">

        {/* Header */}
        <header className="flex items-center justify-between gap-4 border-b border-zinc-200/80 pb-6 dark:border-zinc-800/80">
          <div className="space-y-0.5">
            <p className="font-mono text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              {HOME_COPY.eyebrow}
            </p>
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Welcome back, {displayName}
            </p>
          </div>

          <div className="flex items-center gap-4">
            <ThemeToggle />
            <Link
              href="/api/auth/logout"
               prefetch={false}
              className="font-mono text-xs text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              {HOME_COPY.signOut}
            </Link>
          </div>
        </header>

        {/* Products */}
        <main className="flex-1 py-10">
          <div className="mb-8 space-y-1">
            <h1 className="font-mono text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              {HOME_COPY.title}
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">{HOME_COPY.subtitle}</p>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {WORKSPACE_PRODUCTS.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </main>

        {/* Footer */}
        <footer className="border-t border-zinc-200/80 pt-6 dark:border-zinc-800/80">
          <p className="font-mono text-xs text-zinc-400 dark:text-zinc-600">{HOME_COPY.footerNote}</p>
        </footer>
      </div>
    </div>
  );
}