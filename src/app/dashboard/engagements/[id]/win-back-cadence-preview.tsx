"use client";

// src/app/dashboard/engagements/[id]/win-back-cadence-preview.tsx

import { useState } from "react";
import { Mail, MessageSquare, ChevronDown, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { TriggerSkillButton } from "./trigger-skill-button";

export interface WinBackCadenceAssetMap {
  windowDays: number;
  generatedAt: string;
  emails: Array<{ id: string; offsetDays: number; subject?: string; body: string }>;
  sms: Array<{ id: string; offsetDays: number; body: string }>;
}

interface Touch {
  key: string;
  type: "email" | "sms";
  offsetDays: number;
  subject?: string;
  body: string;
}

function dayLabel(offsetDays: number): string {
  if (offsetDays === 0) return "Day 0 — same day";
  return `Day ${offsetDays}`;
}

export function WinBackCadencePreview({
  assetMap,
  engagementId,
}: {
  assetMap: WinBackCadenceAssetMap | null;
  engagementId: string;
}) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  if (!assetMap) {
    return (
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-[#f8f7fa] dark:bg-zinc-950 p-5 font-sans">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-amber-300 bg-amber-100 text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-400">
            <Sparkles size={13} />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white font-sans">Recovery Cadence</h3>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-sans mt-1 max-w-md">
              No cadence has been generated yet. Win-Back builds this the first time its sequence runs for this
              engagement — run it now to generate the emails and texts every recovered prospect will receive.
            </p>
            <div className="mt-3 w-56">
              <TriggerSkillButton engagementId={engagementId} skillName="win-back" label="Generate cadence now" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const touches: Touch[] = [
    ...assetMap.emails.map((e) => ({ key: `email-${e.id}`, type: "email" as const, offsetDays: e.offsetDays, subject: e.subject, body: e.body })),
    ...assetMap.sms.map((s) => ({ key: `sms-${s.id}`, type: "sms" as const, offsetDays: s.offsetDays, body: s.body })),
  ].sort((a, b) => a.offsetDays - b.offsetDays);

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-[#f8f7fa] dark:bg-zinc-950 overflow-hidden shadow-xl font-sans">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-100/80 dark:bg-zinc-900/40 px-5 py-3">
        <div>
          <h3 className="text-sm font-bold text-zinc-900 dark:text-white font-sans">Recovery Cadence</h3>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-sans mt-0.5">
            What every prospect who enters win-back actually receives, in order.
          </p>
        </div>
        <span className="text-[10.5px] font-mono font-semibold text-zinc-500 dark:text-zinc-400 shrink-0">
          {assetMap.windowDays}-day window
        </span>
      </div>

      <div className="divide-y divide-zinc-200 dark:divide-zinc-800/60">
        {touches.map((t) => {
          const expanded = expandedKey === t.key;
          return (
            <div key={t.key}>
              <button
                type="button"
                onClick={() => setExpandedKey(expanded ? null : t.key)}
                className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-zinc-100 dark:hover:bg-zinc-900/40 transition-colors cursor-pointer font-sans"
              >
                <span className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors",
                  t.type === "email" 
                    ? "border-sky-300 bg-sky-100 text-sky-700 dark:border-sky-800/60 dark:bg-sky-950/40 dark:text-sky-400" 
                    : "border-emerald-300 bg-emerald-100 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-400"
                )}>
                  {t.type === "email" ? <Mail size={13} /> : <MessageSquare size={13} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10.5px] font-mono font-semibold text-zinc-500 dark:text-zinc-400 shrink-0">{dayLabel(t.offsetDays)}</span>
                    <span className="truncate text-xs font-semibold text-zinc-900 dark:text-white font-sans">
                      {t.type === "email" ? (t.subject || "Email") : "Text message"}
                    </span>
                  </div>
                </div>
                <ChevronDown size={13} className={cn("text-zinc-500 shrink-0 transition-transform", expanded && "rotate-180")} />
              </button>
              {expanded && (
                <div className="px-5 pb-4 pl-[3.25rem]">
                  <p className="text-xs text-zinc-800 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed font-sans rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 p-3 shadow-xs">
                    {t.body}
                  </p>
                </div>
              )}
            </div>
          );
        })}
        {touches.length === 0 && (
          <div className="px-5 py-8 text-center text-[11px] text-zinc-400 dark:text-zinc-600 font-sans">No touches configured.</div>
        )}
      </div>
    </div>
  );
}