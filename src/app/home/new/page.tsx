"use client";

import { useState, use } from "react";
import Link from "next/link";
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

export default function NewWorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const resolvedParams = use(searchParams);
  const error = resolvedParams?.error;

  // Nothing pre-selected — a new client's products are a real choice to
  // make, not a default to opt out of. createWorkspace already validates
  // "at least one" with a clear inline error, so an empty starting state
  // is a fully supported, well-handled case, not a dead end.
  const [selectedPackages, setSelectedPackages] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const togglePackage = (id: string, available: boolean) => {
    if (!available) return;
    setSelectedPackages((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  return (
    <div className="relative min-h-screen bg-zinc-50/50 font-sans text-zinc-600 antialiased dark:bg-zinc-950 dark:text-zinc-400 transition-colors duration-200">
      <div
        className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(#cbd5e1_0.8px,transparent_0.8px)] dark:bg-[radial-gradient(#27272a_0.8px,transparent_0.8px)] [background-size:10px_10px] [mask-image:radial-gradient(ellipse_75%_75%_at_50%_30%,#000_60%,transparent_100%)] opacity-80"
        aria-hidden="true"
      />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-2xl flex-col px-6 py-10 sm:px-10 animate-in fade-in slide-in-from-bottom-2 duration-300 ease-out">
        <Link
          href="/home"
          className="flex items-center justify-center w-8 h-8 rounded-full border border-border bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 transition-all duration-200 hover:scale-105 active:scale-95 shrink-0 mb-8 shadow-elevation-1"
          aria-label="Back to workspaces"
        >
          <ChevronLeft className="w-4 h-4" />
        </Link>

        <div className="mb-8 space-y-1.5">
          <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            New client
          </p>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Set up a new client
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            One workspace per client, fully separate from your others — pick which workers to run for them now, enable more from the Library any time.
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
          className={`space-y-8 transition-opacity duration-200 ${isSubmitting ? "opacity-75 pointer-events-none" : ""}`}
        >
          <div className="space-y-2">
            <label htmlFor="name" className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
              Client name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              // Not disabled on submit — confirmed live (production
              // network trace: the POST to /api/workspaces had
              // content-length: 0, an entirely empty body) that
              // React's setIsSubmitting(true) re-render disables every
              // `disabled={... isSubmitting}` field fast enough to beat
              // the browser's own default form-submission action, which
              // then serializes zero fields — a disabled form control is
              // excluded from submission entirely, per the HTML spec.
              // The visible "disabled" treatment during submit comes
              // from the form wrapper's opacity-75 pointer-events-none
              // instead, which doesn't touch what actually gets sent.
              maxLength={80}
              placeholder="e.g. Acme Roofing Co."
              className="w-full rounded-xl border border-zinc-200 bg-white/80 px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-100 dark:placeholder:text-zinc-600 transition-all duration-200"
            />
            <p className="text-xs text-zinc-400 dark:text-zinc-500">
              The person or business you&apos;re running this for.
            </p>
          </div>

          <div className="space-y-2.5">
            <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
              Choose what to install
            </label>

            {/* auto-fit + minmax gives every card the same width in one
                row (however many products there are today), wrapping only
                once the viewport is too narrow to fit them — "uniform
                horizontally" without hardcoding a column count that would
                look wrong the next time a product is added or removed. */}
            <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
              {WORKSPACE_PRODUCTS.map((product) => {
                const installable = product.status === "available";
                const isSelected = selectedPackages.includes(product.id);

                return (
                  <label
                    key={product.id}
                    className={`group relative flex flex-col rounded-xl border p-3 transition-all duration-200 select-none ${
                      installable
                        ? "cursor-pointer active:scale-[0.98]"
                        : "cursor-not-allowed opacity-60"
                    } ${
                      installable && isSelected
                        ? "border-amber-500/70 bg-amber-500/10 dark:border-amber-400/70 dark:bg-amber-500/10 shadow-xs"
                        : "border-zinc-200/90 bg-white/80 hover:border-zinc-300 dark:border-zinc-800/90 dark:bg-zinc-900/60 dark:hover:border-zinc-700"
                    }`}
                  >
                    {/* No onClick here — the checkbox is the single
                        source of truth. A label wrapping a checkbox
                        already natively forwards a click anywhere in the
                        label to the checkbox (that's the whole point of
                        pairing them), so an onClick here as well fired
                        togglePackage twice per click — once for the
                        label's own click, once more when that native
                        forwarded click bubbled back up through the label.
                        The two toggles canceled out, so selecting/
                        deselecting a card silently did nothing. */}
                    <input
                      type="checkbox"
                      name="packageIds"
                      value={product.id}
                      checked={isSelected}
                      // Not gated on isSubmitting either — see the name
                      // input's comment above; same disabled-excludes-
                      // the-field-from-the-POST mechanism confirmed live.
                      disabled={!installable}
                      onChange={() => togglePackage(product.id, installable)}
                      className="sr-only"
                    />
                    <div className="flex items-center justify-between gap-2 mb-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={product.image}
                        alt={product.name}
                        className="h-7 w-7 shrink-0 object-contain select-none transition-transform duration-200 group-hover:scale-105"
                      />
                      {installable ? (
                        <div
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-all duration-200 ${
                            isSelected
                              ? "border-amber-500 bg-amber-500 text-white scale-100 dark:border-amber-400 dark:bg-amber-400 dark:text-zinc-950"
                              : "border-zinc-300 dark:border-zinc-700 bg-transparent scale-95"
                          }`}
                        >
                          <Check
                            className={`h-2.5 w-2.5 transition-transform duration-200 ${
                              isSelected ? "scale-100" : "scale-0"
                            }`}
                          />
                        </div>
                      ) : (
                        <span className="rounded-full border border-zinc-200 bg-zinc-100 px-1.5 py-0.5 font-mono text-[9px] font-bold text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-500">
                          Coming soon
                        </span>
                      )}
                    </div>
                    <div className="space-y-0.5">
                      <h3 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                        {product.name}
                      </h3>
                      <p className="text-[11px] leading-snug text-zinc-500 dark:text-zinc-400 line-clamp-2">
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
              disabled={isSubmitting}
              className="relative cursor-pointer min-w-[140px] bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200 font-bold text-xs disabled:opacity-80"
            >
              {isSubmitting ? (
                <div className="flex items-center gap-2">
                  <SegmentedBarLoader count={6} />
                  <span>Creating...</span>
                </div>
              ) : (
                "Create client"
              )}
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