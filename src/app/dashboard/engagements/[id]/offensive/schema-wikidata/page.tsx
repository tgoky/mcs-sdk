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
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Tell Google who you are</h1>
        <p className="text-[15px] text-zinc-500 dark:text-zinc-400 mt-1.5 leading-relaxed">
          Google and AI assistants like ChatGPT work out who someone is by joining up their website and profiles. This
          step helps them get it right, so searches for this client show the right person and the right links. There are
          two parts, and neither needs any coding.
        </p>
      </div>

      {loading && <p className="text-xs text-zinc-400 dark:text-zinc-500 italic font-mono">Loading…</p>}
      {error && <p className="text-xs text-red-600 dark:text-red-400 font-mono">{error}</p>}

      {!loading && !error && (
        <>
          <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-white/90 dark:bg-zinc-900/60 p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100">1. Add a snippet to your website</h2>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                  We&apos;ve written a short, invisible snippet that lists this client&apos;s official profiles. Copy it and
                  send it to whoever looks after the website. They paste it into the site&apos;s header (most site
                  builders have a &quot;custom code&quot; or &quot;header code&quot; box). Visitors never see it, only Google does.
                </p>
              </div>
              <button
                onClick={copyJsonLd}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors shrink-0 cursor-pointer"
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? "Copied" : "Copy snippet"}
              </button>
            </div>
            <details className="group">
              <summary className="cursor-pointer text-xs font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
                See what&apos;s in the snippet
              </summary>
              <pre className="mt-2 text-[11px] font-mono bg-zinc-50 dark:bg-zinc-950 rounded-lg p-3 overflow-x-auto max-h-96 text-zinc-700 dark:text-zinc-300">
                {jsonLdText}
              </pre>
            </details>
          </section>

          <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-white/90 dark:bg-zinc-900/60 p-4 space-y-3">
            <div>
              <h2 className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100">2. Create a Wikidata page (optional)</h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                Wikidata is the free public database behind Wikipedia, and Google and AI assistants read it. Create a
                free account at{" "}
                <a href="https://www.wikidata.org" target="_blank" rel="noopener noreferrer" className="underline decoration-dotted underline-offset-2 hover:text-zinc-900 dark:hover:text-zinc-100">
                  wikidata.org
                </a>
                , start a new item for this client, and add each fact below. Rows marked &quot;You fill this in&quot; are
                things we don&apos;t know yet. Wikidata asks for a source link for every fact, such as a profile page or
                a news article.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] font-mono uppercase tracking-wider text-zinc-400 dark:text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                    <th className="py-1.5 pr-3">Fact</th>
                    <th className="py-1.5 pr-3">Value</th>
                    <th className="py-1.5">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {statements.map((s, idx) => (
                    <tr key={`${s.property}-${idx}`} className="border-b border-zinc-100 dark:border-zinc-800/50 last:border-0">
                      <td className="py-2 pr-3 text-zinc-800 dark:text-zinc-200 whitespace-nowrap">
                        <span className="first-letter:uppercase inline-block">{s.label}</span>{" "}
                        <span className="text-[11px] font-mono text-zinc-400 dark:text-zinc-500">{s.property}</span>
                      </td>
                      <td className="py-2 pr-3 text-zinc-600 dark:text-zinc-400 break-all">
                        {s.value || <span className="italic text-zinc-400 dark:text-zinc-500">You fill this in</span>}
                      </td>
                      <td className="py-2 text-zinc-500 dark:text-zinc-400">{s.note ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-white/90 dark:bg-zinc-900/60 p-4">
        <h2 className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100 mb-2">Your steps</h2>
        <OffensiveChecklist engagementId={id} move="a" />
      </section>
    </div>
  );
}
