"use client";

// src/app/dashboard/engagements/[id]/pile-on-ad-creative-briefs.tsx

import { useState } from "react";
import { Megaphone, ChevronDown, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { adCreativePillarLabel } from "@/lib/copy";

export interface AdCreativeBriefPack {
  generatedAt: string;
  objectionsLastRegeneratedAt?: string;
  briefs: Array<{
    id: string;
    pillar: "common_questions" | "deeper_questions" | "success_proof" | "objections";
    hook: string;
    angle: string;
    talkingPoints: string[];
    suggestedFormat: string;
    cta: string;
  }>;
}

export function PileOnAdCreativeBriefs({ pack }: { pack: AdCreativeBriefPack | null }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!pack || pack.briefs.length === 0) {
    return (
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-[#f8f7fa] dark:bg-zinc-950 p-5 font-sans">
        <h3 className="text-sm font-bold text-zinc-900 dark:text-white font-sans">Ad Creative Briefs</h3>
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-sans mt-1">
          No ad creative briefs have been generated yet — this gets built automatically during setup.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-[#f8f7fa] dark:bg-zinc-950 overflow-hidden shadow-xl font-sans">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-100/80 dark:bg-zinc-900/40 px-5 py-3">
        <div>
          <h3 className="text-sm font-bold text-zinc-900 dark:text-white font-sans">Ad Creative Briefs</h3>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-sans mt-0.5">
            Hand these to your editor or copywriter — one brief per content angle.
          </p>
        </div>
        {pack.objectionsLastRegeneratedAt && (
          <span className="flex items-center gap-1 text-[10px] font-mono font-semibold text-amber-600 dark:text-amber-400 shrink-0">
            <Sparkles size={10} /> Objections brief refreshed from a recent call
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 font-sans">
        {pack.briefs.map((b) => {
          const expanded = expandedId === b.id;
          return (
            <div key={b.id} className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 overflow-hidden shadow-xs">
              <div className="px-3.5 pt-3 pb-2.5 font-sans">
                <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800/60 px-2 py-0.5 text-[9.5px] font-mono font-semibold uppercase text-zinc-600 dark:text-zinc-400">
                  <Megaphone size={9} /> {adCreativePillarLabel(b.pillar)}
                </span>
                <p className="mt-2 text-sm font-bold text-zinc-900 dark:text-white font-sans leading-snug">{b.hook}</p>
                <p className="mt-1 text-[11px] text-zinc-600 dark:text-zinc-400 font-sans leading-relaxed">{b.angle}</p>
              </div>

              <button
                type="button"
                onClick={() => setExpandedId(expanded ? null : b.id)}
                className="flex w-full items-center justify-between gap-2 border-t border-zinc-200 dark:border-zinc-800/60 px-3.5 py-2 text-left hover:bg-zinc-100 dark:hover:bg-zinc-900/60 transition-colors cursor-pointer font-sans"
              >
                <span className="text-[10.5px] font-mono text-zinc-500">{expanded ? "Hide details" : "Talking points, format & CTA"}</span>
                <ChevronDown size={12} className={cn("text-zinc-500 shrink-0 transition-transform", expanded && "rotate-180")} />
              </button>

              {expanded && (
                <div className="border-t border-zinc-200 dark:border-zinc-800/60 px-3.5 py-3 space-y-2.5 bg-zinc-50/50 dark:bg-transparent font-sans">
                  <div>
                    <span className="text-[9.5px] font-mono font-bold uppercase text-zinc-500">Talking points</span>
                    <ul className="mt-1 space-y-1">
                      {b.talkingPoints.map((tp, i) => (
                        <li key={i} className="text-[11px] text-zinc-800 dark:text-zinc-300 font-sans leading-snug flex gap-1.5">
                          <span className="text-zinc-400 dark:text-zinc-600 font-mono text-[10px] shrink-0">{i + 1}.</span>
                          <span>{tp}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-sans pt-1">
                    <span className="text-zinc-500 font-semibold">Format</span>
                    <span className="text-zinc-800 dark:text-zinc-300 font-medium text-right">{b.suggestedFormat}</span>
                  </div>
                  <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-2.5 py-1.5 font-sans">
                    <span className="text-[9.5px] font-mono uppercase text-zinc-500 block">CTA</span>
                    <span className="text-xs font-medium text-zinc-900 dark:text-white font-sans">{b.cta}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}