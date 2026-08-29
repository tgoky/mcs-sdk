import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";

export type ProductSetupState = "configured" | "needs_setup";

export interface ProductCardData {
  id: string;
  name: string;
  description: string;
  setupState: ProductSetupState;
  /** Where "Set up" links to for a needs_setup product. Undefined means
   * there's genuinely nowhere to send them yet (a product that's
   * installed but whose own setup flow isn't built — shouldn't happen
   * for anything actually reachable from WORKSPACE_PRODUCTS today, but
   * typed as optional rather than assumed so a future product mid-build
   * can't silently render a dead link). */
  setupHref?: string;
}

/**
 * One card per product installed on this workspace (not per skill —
 * SkillsPanel just below already covers Showtime's own 5). Deliberately
 * renders nothing when there's only one installed product and it's
 * already configured: a single-product workspace with everything set up
 * doesn't need a status board reminding it of that on every visit — the
 * panel earns its place once there's more than one product, or something
 * genuinely needs attention.
 */
export function ProductsPanel({ products }: { products: ProductCardData[] }) {
  const anyNeedsSetup = products.some((p) => p.setupState === "needs_setup");
  if (products.length <= 1 && !anyNeedsSetup) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider font-mono">Products</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {products.map((product) => {
          const isConfigured = product.setupState === "configured";
          return (
            <div
              key={product.id}
              className={`rounded-2xl border p-4 flex flex-col justify-between min-h-[140px] transition-all shadow-2xs ${
                isConfigured
                  ? "border-zinc-200 dark:border-zinc-800/80 bg-white/90 dark:bg-zinc-900/60 backdrop-blur-xs"
                  : "border-amber-300/70 dark:border-amber-500/30 bg-amber-50/40 dark:bg-amber-500/[0.04] backdrop-blur-xs"
              }`}
            >
              <div className="space-y-1">
                <span className="text-sm font-bold tracking-tight text-zinc-900 dark:text-zinc-100">{product.name}</span>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug line-clamp-2">{product.description}</p>
              </div>

              <div className="border-t border-zinc-100 dark:border-zinc-800/60 pt-2.5 mt-3 flex items-center justify-between">
                {isConfigured ? (
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md border text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/40 inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Configured
                  </span>
                ) : (
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md border text-amber-700 dark:text-amber-400 bg-amber-100/60 dark:bg-amber-950/30 border-amber-300/50 dark:border-amber-900/40">
                    Needs setup
                  </span>
                )}

                {!isConfigured && product.setupHref && (
                  <Link
                    href={product.setupHref}
                    className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1 group"
                  >
                    Set up
                    <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
