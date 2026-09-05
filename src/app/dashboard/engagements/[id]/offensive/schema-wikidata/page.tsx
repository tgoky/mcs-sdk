"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Copy, Check } from "lucide-react";
import { OffensiveChecklist } from "@/features/reputation-manager/offensive-checklist";

type WikidataStatement = {
  property: string;
  label: string;
  value: string;
  needsManualInput: boolean;
  referenceUrl: string | null;
  note?: string;
};

/**
 * Move A — generates the JSON-LD graph and Wikidata statements from this
 * client's identity graph. Both are for the operator to take and apply by
 * hand (paste into a <head>, submit at wikidata.org) — see
 * schema-wikidata.ts's file comment for why there's no "publish" button.
 */
export default function SchemaWikidataPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jsonLd, setJsonLd] = useState<object | null>(null);
  const [statements, setStatements] = useState<WikidataStatement[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/engagements/${id}/offensive/schema-wikidata`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load");
        if (cancelled) return;
        setJsonLd(data.jsonLd);
        setStatements(data.wikidataStatements ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const jsonLdText = jsonLd ? JSON.stringify(jsonLd, null, 2) : "";

  async function copyJsonLd() {
    // Escape "<" so a client-entered name/alias/handle containing
    // "</script>" can't break out of the tag once this is pasted into a
    // real page's <head> — < is still valid inside a JSON string and
    // decodes back to "<" when parsed, so this doesn't change the data,
    // only how it's embedded in this literal script tag. The on-screen
    // preview above stays unescaped/readable; only the copied text needs this.
    const escapedForScriptTag = jsonLdText.replace(/</g, "\\u003c");
    await navigator.clipboard.writeText(`<script type="application/ld+json">\n${escapedForScriptTag}\n</script>`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="max-w-3xl mx-auto py-12 px-4 space-y-6">
      <button
        onClick={() => router.push(`/dashboard/engagements/${id}/offensive`)}
        className="inline-flex items-center gap-1 text-xs font-mono font-semibold text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors"
      >
        <ChevronLeft size={14} />
        Back to playbook
      </button>

      <div>
        <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Move A — Schema & Wikidata</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          Generated from this client&apos;s identity graph. Paste the JSON-LD into every owned domain, then work through the Wikidata submission by hand.
        </p>
      </div>

      {loading && <p className="text-xs text-zinc-400 dark:text-zinc-500 italic font-mono">Loading…</p>}
      {error && <p className="text-xs text-red-600 dark:text-red-400 font-mono">{error}</p>}

      {!loading && !error && (
        <>
          <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-white/90 dark:bg-zinc-900/60 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider font-mono text-zinc-900 dark:text-zinc-100">JSON-LD graph</h2>
              <button
                onClick={copyJsonLd}
                className="inline-flex items-center gap-1.5 text-[11px] font-mono font-bold px-2.5 py-1 rounded-md border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? "Copied" : "Copy <script> tag"}
              </button>
            </div>
            <pre className="text-[11px] font-mono bg-zinc-50 dark:bg-zinc-950 rounded-lg p-3 overflow-x-auto max-h-96 text-zinc-700 dark:text-zinc-300">
              {jsonLdText}
            </pre>
          </section>

          <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-white/90 dark:bg-zinc-900/60 p-4 space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider font-mono text-zinc-900 dark:text-zinc-100">Wikidata statements</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[10px] font-mono uppercase tracking-wider text-zinc-400 dark:text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                    <th className="py-1.5 pr-3">Property</th>
                    <th className="py-1.5 pr-3">Value</th>
                    <th className="py-1.5">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {statements.map((s, idx) => (
                    <tr key={`${s.property}-${idx}`} className="border-b border-zinc-100 dark:border-zinc-800/50 last:border-0">
                      <td className="py-2 pr-3 font-mono font-semibold text-zinc-700 dark:text-zinc-300 whitespace-nowrap">
                        {s.property} <span className="text-zinc-400 dark:text-zinc-500 font-normal">{s.label}</span>
                      </td>
                      <td className="py-2 pr-3 font-mono text-zinc-600 dark:text-zinc-400 break-all">
                        {s.value || <span className="italic text-amber-600 dark:text-amber-400">needs manual input</span>}
                      </td>
                      <td className="py-2 text-zinc-500 dark:text-zinc-400">{s.note ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 italic">
              Every statement still needs its own reference URL (P854) and retrieved-date (P813) at submission time.
            </p>
          </section>
        </>
      )}

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-white/90 dark:bg-zinc-900/60 p-4">
        <h2 className="text-xs font-bold uppercase tracking-wider font-mono text-zinc-900 dark:text-zinc-100 mb-2">Deploy checklist</h2>
        <OffensiveChecklist engagementId={id} move="a" />
      </section>
    </div>
  );
}
