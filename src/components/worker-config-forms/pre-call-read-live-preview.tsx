"use client";

// Phase 3's "preview-first entry point" for Pre-Call Read — the third and
// last of the 3-worker resolution (see pin-down-live-preview.tsx and
// icp-lock-live-preview.tsx for the other two, each resolved on its own
// honest terms rather than copied from one another).
//
// Pre-Call Read's real artifact is LLM-generated per real prospect/CRM
// data at send time (buildBriefSystemPrompt in brief-service.ts, called
// from a real Inngest run) — there is no cheap, deterministic template to
// preview the way Pin-Down's confirmation page has. Calling the real model
// speculatively from a config screen would be slow and, on a credit-billed
// product, a real cost for zero value. So this is deliberately NOT a
// generator: it's a static, clearly-labeled example brief using a
// fictional prospect, built from the exact 7 sections
// buildBriefSystemPrompt actually requires (Prospect Overview, Company
// Context, Engagement History, Likely Objections, Recommended Opening,
// Red Flags, Conversation Notes) — not invented, read straight from that
// prompt — with the parts that vary by real configuration (delivery
// timing, which optional add-ons are on) spliced in from the form's own
// live state, same as Pin-Down's preview reflects real offer details.

import { Sparkles } from "lucide-react";

const SECTIONS: { title: string; body: string }[] = [
  { title: "Prospect Overview", body: "Jordan Kim, VP of Sales at Northwind Robotics. Booked via the confirmation page, no prior contact on file." },
  { title: "Company Context", body: "Northwind Robotics — 40-person industrial automation startup, raised a Series A 6 months ago per public research." },
  { title: "Engagement History", body: "Opened 2 of 3 Pile-On sequence emails. No confirmation-page video watched yet." },
  { title: "Likely Objections", body: "Budget timing (just raised, may want to wait for board sign-off) and implementation bandwidth." },
  { title: "Recommended Opening", body: "Lead with the Series A — ask what changes for their ops team in the next 2 quarters." },
  { title: "Red Flags", body: "None on file yet — this section stays empty unless something real turns up." },
  { title: "Conversation Notes", body: "Booking notes: “Looking to cut manual QA time before we scale headcount.”" },
];

export function PreCallReadLivePreview({
  briefTriggerType,
  videoEngagementPlatform,
  prospectResearchSourcesUsed,
}: {
  briefTriggerType: "nightly" | "dynamic_webhook";
  videoEngagementPlatform: string;
  prospectResearchSourcesUsed: string[];
}) {
  const addOns: string[] = [];
  if (videoEngagementPlatform !== "none") addOns.push("confirmation-page video engagement");
  if (prospectResearchSourcesUsed.length > 0) addOns.push(`${prospectResearchSourcesUsed.join(" + ")} enrichment`);

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-100 dark:border-zinc-900 bg-zinc-50/50 dark:bg-zinc-900/30">
        <div className="flex items-center gap-1.5 min-w-0">
          <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">Example brief — not live-generated</span>
        </div>
        <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-600 shrink-0">fictional prospect</span>
      </div>
      <div className="px-3 py-2.5 space-y-2">
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
          {briefTriggerType === "nightly"
            ? "Delivered as a nightly batch at 20:00 UTC for tomorrow's roster."
            : "Delivered individually within 15 minutes of entering the lead window."}
          {addOns.length > 0 && ` Includes ${addOns.join(" and ")}.`}
        </p>
        <div className="space-y-1.5">
          {SECTIONS.map((s) => (
            <div key={s.title} className="text-xs">
              <span className="font-semibold text-zinc-800 dark:text-zinc-200">{s.title}: </span>
              <span className="text-zinc-500 dark:text-zinc-400">{s.body}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="px-3 py-1.5 text-[10px] text-zinc-400 dark:text-zinc-600 leading-relaxed border-t border-zinc-100 dark:border-zinc-900">
        The real brief is written per prospect from actual booking/CRM/research data once Pre-Call Read runs — this
        is a fixed example of its shape, not a preview of real upcoming content.
      </p>
    </div>
  );
}
