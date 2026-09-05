"use client";

import { Fingerprint, ShieldCheck } from "lucide-react";
import { EmptyState } from "../_shared/empty-state";
import type { RepOnboardingDetail } from "../_shared/types";

export function RepOnboardingView({ detail }: { detail: RepOnboardingDetail }) {
  const { identityGraph } = detail;

  if (!identityGraph) {
    return (
      <EmptyState
        icon={Fingerprint}
        title="No identity graph recorded"
        description="This run either failed before the intake form was saved, or it ran before this client's identity graph existed."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3 font-sans antialiased">
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Fingerprint size={14} className="text-zinc-500 dark:text-zinc-500" />
          <h2 className="text-xs font-bold uppercase tracking-wide text-zinc-800 dark:text-zinc-200">Identity graph</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <p className="text-[10px] uppercase text-zinc-500 dark:text-zinc-500 font-bold">Operator</p>
            <p className="text-zinc-800 dark:text-zinc-200 font-semibold mt-0.5">{identityGraph.operatorName}</p>
            {identityGraph.operatorAliases.length > 0 && (
              <p className="text-zinc-500 dark:text-zinc-400 mt-0.5">aka {identityGraph.operatorAliases.join(", ")}</p>
            )}
          </div>
          <div>
            <p className="text-[10px] uppercase text-zinc-500 dark:text-zinc-500 font-bold">Sole authority</p>
            <p className="text-zinc-800 dark:text-zinc-200 font-semibold mt-0.5 flex items-center gap-1">
              <ShieldCheck size={12} className="text-emerald-500" />
              {identityGraph.soleAuthorityName}
            </p>
          </div>
        </div>
      </div>

      {identityGraph.entities.length > 0 && (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4">
          <h3 className="text-[11px] font-bold uppercase tracking-wide text-zinc-700 dark:text-zinc-300 mb-2">
            Entities ({identityGraph.entities.length})
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {identityGraph.entities.map((e) => (
              <span
                key={e.name}
                className="text-[11px] font-mono px-2 py-1 rounded-md bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800"
              >
                {e.name} <span className="text-zinc-400 dark:text-zinc-600">({e.type})</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {identityGraph.collisions.length > 0 && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/40 dark:bg-amber-950/10 p-4">
          <h3 className="text-[11px] font-bold uppercase tracking-wide text-amber-800 dark:text-amber-300 mb-2">
            Same-name collisions ({identityGraph.collisions.length})
          </h3>
          <ul className="space-y-2">
            {identityGraph.collisions.map((c, i) => (
              <li key={i} className="text-xs text-zinc-700 dark:text-zinc-300">
                <span className="font-semibold">{c.name}</span> — {c.whoTheyAre}
                <p className="text-zinc-500 dark:text-zinc-400 mt-0.5">{c.disambiguationNote}</p>
                <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-600">
                  {c.source === "buyer" ? "reported by buyer" : "found by collision check"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {identityGraph.seedPanelPrompts.length > 0 && (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4">
          <h3 className="text-[11px] font-bold uppercase tracking-wide text-zinc-700 dark:text-zinc-300 mb-2">
            Seed AI-engine prompts ({identityGraph.seedPanelPrompts.length})
          </h3>
          <ul className="space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
            {identityGraph.seedPanelPrompts.map((p, i) => (
              <li key={i} className="font-mono">
                &ldquo;{p}&rdquo;
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
