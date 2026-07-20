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
      className={`group flex h-full flex-col justify-between rounded-lg border p-5 transition-colors ${
        isAvailable
          ? "border-zinc-200 bg-zinc-100/50 hover:border-zinc-300 hover:bg-zinc-200/40 dark:border-zinc-900/60 dark:bg-zinc-900/10 dark:hover:border-zinc-800 dark:hover:bg-zinc-900/20"
          : "border-zinc-200/60 bg-zinc-50/50 dark:border-zinc-900/40 dark:bg-zinc-950/40"
      }`}
    >
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-zinc-200/60 text-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-300">
            <Icon size={17} />
          </div>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
              isAvailable
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                : "bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-500"
            }`}
          >
            {HOME_COPY.statusLabels[product.status]}
          </span>
        </div>

        <div className="space-y-1">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            {product.name}
          </h2>
          <p className="text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
            {product.description}
          </p>
        </div>
      </div>

      <div className="pt-5">
        {isAvailable ? (
          <Button className="w-full cursor-pointer">
            {HOME_COPY.openLabel} {product.name}
            <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
          </Button>
        ) : (
          <Button variant="outline" disabled className="w-full">
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
    <div className="min-h-screen bg-white text-zinc-600 antialiased dark:bg-zinc-950 dark:text-zinc-400">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-10 sm:px-8">

        {/* Header */}
        <header className="flex items-center justify-between gap-4 border-b border-zinc-200 pb-6 dark:border-zinc-900">
          <div className="space-y-1">
            <p className="font-mono text-xs uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              {HOME_COPY.eyebrow}
            </p>
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Welcome back, {displayName}
            </p>
          </div>

          <div className="flex items-center gap-4">
            <ThemeToggle />
            <Link
              href="/api/auth/logout"
              className="font-mono text-xs text-zinc-400 transition-colors hover:text-zinc-900 dark:text-zinc-500 dark:hover:text-zinc-300"
            >
              {HOME_COPY.signOut}
            </Link>
          </div>
        </header>

        {/* Products */}
        <main className="flex-1 py-10">
          <div className="mb-6 space-y-1">
            <p className="font-mono text-xs uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              {HOME_COPY.title}
            </p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">{HOME_COPY.subtitle}</p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {WORKSPACE_PRODUCTS.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </main>

        {/* Footer */}
        <footer className="border-t border-zinc-200 pt-6 dark:border-zinc-900">
          <p className="font-mono text-xs text-zinc-400 dark:text-zinc-600">{HOME_COPY.footerNote}</p>
        </footer>
      </div>
    </div>
  );
}
