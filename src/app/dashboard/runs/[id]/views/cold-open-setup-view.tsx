"use client";

// Shared run-detail view for Cold Open's 4 setup skills (ICP Lock, Voice
// Capture, Source Connect, Send Connect) — same "one view over the whole
// captured state" precedent RepOnboardingView already set for
// rep-onboarding: a setup run's real value is what got captured, not a
// time-scoped slice of an ingestion table (these skills have none).

import { Target, Mic, Database, Send as SendIcon } from "lucide-react";
import { EmptyState } from "../_shared/empty-state";
import type { ColdOpenSetupDetail } from "../_shared/types";

export function ColdOpenSetupView({ detail }: { detail: ColdOpenSetupDetail }) {
  const { config } = detail;

  if (!config) {
    return (
      <EmptyState
        icon={Target}
        title="No Cold Open config recorded"
        description="This run either failed before its settings were saved, or ran before ICP Lock had been completed for this client."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 font-sans antialiased">
      {config.productIdentity && (
        <div>
          <div className="flex items-center gap-2 pb-2 border-b border-zinc-200 dark:border-zinc-800 mb-2">
            <Target size={13} className="text-zinc-500 dark:text-zinc-500" />
            <h3 className="text-[11px] font-bold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">Product identity</h3>
          </div>
          <p className="text-xs text-zinc-800 dark:text-zinc-200 font-semibold">{config.productIdentity.name}</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{config.productIdentity.valueProp}</p>
          <p className="text-[10.5px] font-mono text-zinc-400 dark:text-zinc-600 mt-1">
            {config.productIdentity.url} · {config.productIdentity.price}
          </p>
        </div>
      )}

      {config.icps.length > 0 && (
        <div>
          <h3 className="text-[11px] font-bold uppercase tracking-wide text-zinc-700 dark:text-zinc-300 mb-2 pb-2 border-b border-zinc-200 dark:border-zinc-800">
            ICPs ({config.icps.length})
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {config.icps.map((icp) => (
              <span
                key={icp.slug}
                className="text-[11px] font-mono px-2 py-1 rounded-md bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800"
              >
                {icp.label} <span className="text-zinc-400 dark:text-zinc-600">(weight {icp.weight})</span>
                {config.reviewRequiredIcps.includes(icp.slug) && <span className="text-amber-600 dark:text-amber-400"> · review-required</span>}
              </span>
            ))}
          </div>
        </div>
      )}

      {config.voiceProfile && (
        <div>
          <div className="flex items-center gap-2 pb-2 border-b border-zinc-200 dark:border-zinc-800 mb-2">
            <Mic size={13} className="text-zinc-500 dark:text-zinc-500" />
            <h3 className="text-[11px] font-bold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">Voice</h3>
          </div>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            <span className="font-semibold text-zinc-800 dark:text-zinc-200">Tone:</span> {config.voiceProfile.tone}
          </p>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 italic">&ldquo;{config.voiceProfile.greeting}&rdquo;</p>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 italic">&ldquo;{config.voiceProfile.signOff}&rdquo;</p>
          {config.subjectVariants.length > 0 && (
            <p className="text-[10.5px] font-mono text-zinc-400 dark:text-zinc-600 mt-1">{config.subjectVariants.length} subject variant(s)</p>
          )}
        </div>
      )}

      {config.leadSources.length > 0 && (
        <div>
          <div className="flex items-center gap-2 pb-2 border-b border-zinc-200 dark:border-zinc-800 mb-2">
            <Database size={13} className="text-zinc-500 dark:text-zinc-500" />
            <h3 className="text-[11px] font-bold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">Lead sources</h3>
          </div>
          <div className="space-y-1.5">
            {config.leadSources.map((src, i) => (
              <p key={i} className="text-xs text-zinc-600 dark:text-zinc-400">
                <span className="font-semibold text-zinc-800 dark:text-zinc-200">{src.icp}</span> : {src.fetcherType}
                {src.dailyLimit ? ` · up to ${src.dailyLimit}/day` : ""}
              </p>
            ))}
          </div>
        </div>
      )}

      {config.sendPlatform && (
        <div>
          <div className="flex items-center gap-2 pb-2 border-b border-zinc-200 dark:border-zinc-800 mb-2">
            <SendIcon size={13} className="text-zinc-500 dark:text-zinc-500" />
            <h3 className="text-[11px] font-bold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">Send platform</h3>
          </div>
          <p className="text-xs text-zinc-800 dark:text-zinc-200 font-semibold">{config.sendPlatform.platform}</p>
          {Object.keys(config.campaignMap).length > 0 && (
            <div className="mt-1.5 space-y-0.5">
              {Object.entries(config.campaignMap).map(([icp, campaignId]) => (
                <p key={icp} className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
                  {icp} → {campaignId}
                  {config.autoPushIcps.includes(icp) && <span className="text-[#424d77] dark:text-[#c5b7ea]"> (auto-push)</span>}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
