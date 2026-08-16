"use client";

// src/app/dashboard/engagements/[id]/win-back-cadence-preview.tsx
//
// Renders engagements.winBackSequenceAssetMap — the actual recovery
// cadence content (buildRecoveryCadence in cadence-builder.ts, generated
// once at Pin-Down onboarding, stored on the engagement, and reused by
// every enrollment: win-back-email-smtp.ts, win-back-sms.ts, and
// enrollment-service.ts's win_back_hybrid/win_back_sms/win_back_email_smtp
// steps all read directly from this same asset map rather than
// regenerating anything).
//
// This is the *template* — every enrollment created after it runs the
// same sequence — so unlike WinBackPipeline (this engagement's actual
// enrollments) or WinBackView (one enrollment's real send history), there
// is no per-touch status here; it's the answer to "what messages does a
// prospect who enters recovery actually receive, and when."
//
// win-back-view.tsx already builds an equivalent touchpoint list from the
// same asset map shape, but for one specific enrollment's run (it needs
// enrollment.enrolledAt + sendLog to compute real dates and per-touch
// send status). This is deliberately a smaller, template-only sibling
// rather than a shared abstraction with that component — forcing this
// engagement-wide, status-free view and that per-enrollment,
// status-carrying view through one shared component would mean threading
// optional enrollment/sendLog props through code that has no use for
// them.

import { useState } from "react";
import { Mail, MessageSquare, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

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

export function WinBackCadencePreview({ assetMap }: { assetMap: WinBackCadenceAssetMap | null }) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  if (!assetMap) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
        <h3 className="text-sm font-bold text-white font-sans">Recovery Cadence</h3>
        <p className="text-[11px] text-zinc-500 font-sans mt-1">
          No cadence has been generated yet — this gets built automatically the first time this engagement&apos;s setup runs.
        </p>
      </div>
    );
  }

  const touches: Touch[] = [
    ...assetMap.emails.map((e) => ({ key: `email-${e.id}`, type: "email" as const, offsetDays: e.offsetDays, subject: e.subject, body: e.body })),
    ...assetMap.sms.map((s) => ({ key: `sms-${s.id}`, type: "sms" as const, offsetDays: s.offsetDays, body: s.body })),
  ].sort((a, b) => a.offsetDays - b.offsetDays);

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-900/40 px-5 py-3">
        <div>
          <h3 className="text-sm font-bold text-white font-sans">Recovery Cadence</h3>
          <p className="text-[11px] text-zinc-500 font-sans mt-0.5">
            What every prospect who enters win-back actually receives, in order.
          </p>
        </div>
        <span className="text-[10.5px] font-mono text-zinc-500 shrink-0">{assetMap.windowDays}-day window</span>
      </div>

      <div className="divide-y divide-zinc-900">
        {touches.map((t) => {
          const expanded = expandedKey === t.key;
          return (
            <div key={t.key}>
              <button
                type="button"
                onClick={() => setExpandedKey(expanded ? null : t.key)}
                className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-zinc-900/40 transition-colors cursor-pointer"
              >
                <span className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border",
                  t.type === "email" ? "border-sky-800/60 bg-sky-950/40 text-sky-400" : "border-emerald-800/60 bg-emerald-950/40 text-emerald-400"
                )}>
                  {t.type === "email" ? <Mail size={13} /> : <MessageSquare size={13} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10.5px] font-mono text-zinc-500 shrink-0">{dayLabel(t.offsetDays)}</span>
                    <span className="truncate text-xs font-semibold text-white font-sans">
                      {t.type === "email" ? (t.subject || "Email") : "Text message"}
                    </span>
                  </div>
                </div>
                <ChevronDown size={13} className={cn("text-zinc-500 shrink-0 transition-transform", expanded && "rotate-180")} />
              </button>
              {expanded && (
                <div className="px-5 pb-4 pl-[3.25rem]">
                  <p className="text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed font-sans rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                    {t.body}
                  </p>
                </div>
              )}
            </div>
          );
        })}
        {touches.length === 0 && (
          <div className="px-5 py-8 text-center text-[11px] text-zinc-600 font-sans">No touches configured.</div>
        )}
      </div>
    </div>
  );
}
