"use client";

import { useState, use } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WORKSPACE_PRODUCTS } from "@/lib/copy";

function SegmentedBarLoader({ count = 8 }: { count?: number }) {
  return (
    <div className="flex items-center gap-1 justify-center py-1 select-none">
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          className="h-3.5 w-1.5 rounded-[1px] bg-zinc-900 dark:bg-zinc-100 animate-pulse shadow-[0_0_6px_rgba(255,255,255,0.3)]"
          style={{
            animationDelay: `${i * 75}ms`,
            animationDuration: "750ms",
          }}
        />
      ))}
    </div>
  );
}

function PackageIcon({ productId }: { productId: string }) {
  if (productId === "reputation-manager") {
    return (
      <img
        src="/images/repm.png"
        alt="Reputation Manager"
        className="h-10 w-10 shrink-0 object-contain select-none transition-transform duration-200 group-hover:scale-105"
      />
    );
  }
  return (
    <img
      src="/images/showtime.png"
      alt="Showtime"
      className="h-10 w-10 shrink-0 object-contain select-none transition-transform duration-200 group-hover:scale-105"
    />
  );
}

export default function NewWorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const router = useRouter();
  const resolvedParams = use(searchParams);
  const error = resolvedParams?.error;

  const filteredProducts = WORKSPACE_PRODUCTS.filter(
    (product) => product.id !== "counter-claim"
  );

  const [selectedPackages, setSelectedPackages] = useState<string[]>(() =>
    filteredProducts
      .filter((p) => p.status === "available")
      .map((p) => p.id)
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  // Triggers the "Genie" morph back into the workspace home button
  const handleExitBack = (e: React.MouseEvent) => {
    e.preventDefault();
    if (isExiting || isSubmitting) return;
    setIsExiting(true);
    setTimeout(() => {
      router.push("/home");
    }, 320); // Syncs with 320ms genie exit CSS curve
  };

  const togglePackage = (id: string, available: boolean) => {
    if (!available) return;
    setSelectedPackages((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  return (
    <div className="relative min-h-screen bg-zinc-50/50 font-sans text-zinc-600 antialiased dark:bg-zinc-950 dark:text-zinc-400 transition-colors duration-300 overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(#cbd5e1_0.8px,transparent_0.8px)] dark:bg-[radial-gradient(#27272a_0.8px,transparent_0.8px)] [background-size:10px_10px] [mask-image:radial-gradient(ellipse_75%_75%_at_50%_30%,#000_60%,transparent_100%)] opacity-80"
        aria-hidden="true"
      />

      {/* Main Container with Genie In/Out Transform Dynamics */}
      <div
        className={`relative z-10 mx-auto flex min-h-screen w-full max-w-2xl flex-col px-6 py-10 sm:px-10 origin-bottom-left transition-all duration-300 ease-[cubic-bezier(0.32,0,0.67,0)] ${
          isExiting
            ? "scale-x-25 scale-y-0 translate-y-32 opacity-0 blur-md pointer-events-none"
            : "animate-in fade-in zoom-in-95 slide-in-from-bottom-8 duration-300 ease-out"
        }`}
      >
        {/* Back Button with Genie Exit */}
        <button
          type="button"
          onClick={handleExitBack}
          className="flex items-center justify-center w-8 h-8 rounded-full border border-border bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 transition-all duration-200 hover:scale-110 active:scale-90 shrink-0 mb-8 shadow-2xs cursor-pointer"
          aria-label="Back to workspaces"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

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
          <div className="mb-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-medium text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300 animate-in fade-in duration-200">
            {error}
          </div>
        )}

        <form
          action="/api/workspaces"
          method="POST"
          onSubmit={() => setIsSubmitting(true)}
          className={`space-y-8 transition-opacity duration-200 ${
            isSubmitting ? "opacity-75 pointer-events-none" : ""
          }`}
        >
          <div className="space-y-2">
            <label htmlFor="name" className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
              Workspace name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              disabled={isSubmitting || isExiting}
              maxLength={80}
              placeholder="e.g. Acme Sales Team"
              className="w-full rounded-xl border border-zinc-200 bg-white/80 px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-100 dark:placeholder:text-zinc-600 transition-all duration-200"
            />
          </div>

          <div className="space-y-2.5">
            <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
              Choose what to install
            </label>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {filteredProducts.map((product) => {
                const installable = product.status === "available";
                const isSelected = selectedPackages.includes(product.id);

                return (
                  <label
                    key={product.id}
                    onClick={() => togglePackage(product.id, installable)}
                    className={`group relative flex flex-col justify-between rounded-2xl border p-4 transition-all duration-200 select-none ${
                      installable
                        ? "cursor-pointer active:scale-[0.97]"
                        : "cursor-not-allowed opacity-60"
                    } ${
                      installable && isSelected
                        ? "border-teal-500/80 bg-teal-50/50 dark:border-teal-400/80 dark:bg-teal-950/30 shadow-xs"
                        : "border-zinc-200/90 bg-white/80 hover:border-zinc-300 dark:border-zinc-800/90 dark:bg-zinc-900/60 dark:hover:border-zinc-700"
                    }`}
                  >
                    <input
                      type="checkbox"
                      name="packageIds"
                      value={product.id}
                      checked={isSelected}
                      disabled={!installable || isSubmitting || isExiting}
                      onChange={() => {}}
                      className="sr-only"
                    />
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <PackageIcon productId={product.id} />
                      {installable ? (
                        <div
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-all duration-200 ${
                            isSelected
                              ? "border-teal-500 bg-teal-500 text-white scale-100 dark:border-teal-400 dark:bg-teal-400 dark:text-zinc-950"
                              : "border-zinc-300 dark:border-zinc-700 bg-transparent scale-90"
                          }`}
                        >
                          <Check
                            className={`h-3 w-3 transition-transform duration-200 ${
                              isSelected ? "scale-100" : "scale-0"
                            }`}
                          />
                        </div>
                      ) : (
                        <span className="rounded-full border border-zinc-200 bg-zinc-100 px-2 py-0.5 font-mono text-[10px] font-bold text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-500">
                          Coming soon
                        </span>
                      )}
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                        {product.name}
                      </h3>
                      <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                        {product.description}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button
              type="submit"
              disabled={isSubmitting || isExiting}
              className="relative cursor-pointer min-w-[140px] bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200 font-bold text-xs shadow-xs transition-all duration-200 hover:scale-[1.01] active:scale-[0.98] disabled:opacity-80"
            >
              {isSubmitting ? (
                <div className="flex items-center gap-2">
                  <SegmentedBarLoader count={6} />
                  <span>Creating...</span>
                </div>
              ) : (
                "Create workspace"
              )}
            </Button>
            {/* Cancel Button with Genie Exit */}
            <button
              type="button"
              onClick={handleExitBack}
              className="font-mono text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors px-2 py-1 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}