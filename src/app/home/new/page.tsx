import Link from "next/link";
import { ArrowLeft, LayoutGrid, Gavel, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WORKSPACE_PRODUCTS } from "@/lib/copy";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function PackageIcon({ productId }: { productId: string }) {
  if (productId === "counter-claim") {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-400 dark:bg-amber-500 shadow-xs select-none">
        <Gavel size={18} className="text-zinc-950 stroke-[2.3px] fill-white" strokeLinecap="round" strokeLinejoin="round" />
      </div>
    );
  }
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-500 dark:bg-teal-400 shadow-xs select-none">
      <LayoutGrid size={18} className="text-zinc-950 stroke-[2.3px] fill-white" strokeLinecap="round" strokeLinejoin="round" />
    </div>
  );
}

/**
 * Workspace creation — a plain HTML form posting to POST /api/workspaces.
 * No client component, no useState, no submit handler: the "which
 * packages are selected" visual state is pure CSS (peer-checked), and
 * validation errors round-trip through a redirect + ?error= query param
 * instead of client-side state. Nothing here can race or get stuck
 * mid-submit.
 */
export default async function NewWorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="relative min-h-screen bg-zinc-50/50 font-sans text-zinc-600 antialiased dark:bg-zinc-950 dark:text-zinc-400 transition-colors duration-200">
      <div
        className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(#cbd5e1_0.8px,transparent_0.8px)] dark:bg-[radial-gradient(#27272a_0.8px,transparent_0.8px)] [background-size:10px_10px] [mask-image:radial-gradient(ellipse_75%_75%_at_50%_30%,#000_60%,transparent_100%)] opacity-80"
        aria-hidden="true"
      />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-2xl flex-col px-6 py-10 sm:px-10">
        <Link
          href="/home"
          className="inline-flex w-fit items-center gap-1.5 font-mono text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors mb-8"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to workspaces
        </Link>

        <div className="mb-8 space-y-1.5">
          <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            New workspace
          </p>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Set up your workspace
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Independent clients and data from your other workspaces — pick what to install now, add more from the Library any time.
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-medium text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
            {error}
          </div>
        )}

        <form action="/api/workspaces" method="POST" className="space-y-8">
          <div className="space-y-2">
            <label htmlFor="name" className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
              Workspace name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              maxLength={80}
              placeholder="e.g. Acme Sales Team"
              className="w-full rounded-xl border border-zinc-200 bg-white/80 px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-100 dark:placeholder:text-zinc-600 transition-colors"
            />
          </div>

          <div className="space-y-2.5">
            <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
              Choose what to install
            </label>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {WORKSPACE_PRODUCTS.map((product) => {
                const installable = product.status === "available";
                return (
                  <label key={product.id} className={installable ? "cursor-pointer" : "cursor-not-allowed"}>
                    <input
                      type="checkbox"
                      name="packageIds"
                      value={product.id}
                      disabled={!installable}
                      className="peer sr-only"
                    />
                    <div
                      // Tailwind's peer-checked: only matches a *direct*
                      // sibling of the checkbox — this div qualifies, but
                      // the dot/check further below don't, so their state
                      // is driven from here via peer-checked:[&_selector]
                      // compound arbitrary variants instead of their own
                      // peer-checked: classes.
                      className={`relative flex h-full flex-col gap-3 rounded-2xl border p-4 transition-all select-none ${
                        installable
                          ? "border-zinc-200/90 bg-white/80 peer-checked:border-teal-500 peer-checked:bg-teal-50/60 peer-focus-visible:ring-2 peer-focus-visible:ring-teal-500/30 peer-checked:[&_.select-dot]:border-teal-500 peer-checked:[&_.select-dot]:bg-teal-500 peer-checked:[&_.select-check]:block dark:border-zinc-800/90 dark:bg-zinc-900/60 dark:peer-checked:border-teal-400 dark:peer-checked:bg-teal-950/30"
                          : "border-zinc-200/60 bg-zinc-50/50 opacity-60 dark:border-zinc-800/40 dark:bg-zinc-950/20"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <PackageIcon productId={product.id} />
                        {installable ? (
                          <div className="select-dot flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-zinc-300 dark:border-zinc-700 transition-colors">
                            <Check className="select-check hidden h-3 w-3 text-white" />
                          </div>
                        ) : (
                          <span className="rounded-full border border-zinc-200 bg-zinc-100 px-2 py-0.5 font-mono text-[10px] font-bold text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-500">
                            Coming soon
                          </span>
                        )}
                      </div>
                      <div className="space-y-1">
                        <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{product.name}</h3>
                        <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                          {product.description}
                        </p>
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" className="cursor-pointer bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200 font-bold text-xs shadow-xs">
              Create workspace
            </Button>
            <Link
              href="/home"
              className="font-mono text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors px-2 py-1"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
