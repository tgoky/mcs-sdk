"use client";

// Phase 3's "preview-first entry point" (see the "Worker Onboarding &
// Gating: Plan" doc), extended past the original 3 workers per this
// session's own follow-up review — voice-capture is genuinely assembling
// email copy from typed fields, same shape as pin-down's confirmation
// page, so the same real-preview treatment applies, not a mockup.
//
// Mirrors copy-engine.ts's own assembleUpload/applyGreetingAndSignOff
// exactly (upload mode only — "generate" mode needs a real LLM call
// grounded in product identity, wrong for a free-standing live preview).
// Deliberately re-implemented here rather than imported: copy-engine.ts
// pulls in @/lib/llm (server-only, uses API credentials), which must
// never ship into a client bundle — this file keeps only the two-line
// deterministic formatting piece that's actually safe to run in the
// browser.

import { Sparkles } from "lucide-react";

function applyGreetingAndSignOff(body: string, greeting: string, signOff: string): string {
  const opener = greeting.trim() ? `${greeting.trim()} there,` : "Hi there,";
  const closer = signOff.trim() || "Best";
  return `${opener}\n\n${body}\n\n${closer}`;
}

export function VoiceCaptureLivePreview({
  greeting,
  signOff,
  subjectVariants,
  firstTouchsetBody,
}: {
  greeting: string;
  signOff: string;
  subjectVariants: string;
  /** touchsets[0].body1 from the caller's own state — the same field
   * copy-engine.ts's assembleUpload reads as touch 1's body. */
  firstTouchsetBody: string;
}) {
  const firstSubject = subjectVariants.split("\n").map((s) => s.trim()).find(Boolean);
  const placeholderSubject = "chatgpt on {company_name}";
  const placeholderBody = "Noticed {company_name} is scaling outbound. Most teams your size are leaving replies on the table because nobody's actually reading them fast enough.";

  const subject = firstSubject || placeholderSubject;
  const body = applyGreetingAndSignOff(firstTouchsetBody.trim() || placeholderBody, greeting, signOff);
  const usingPlaceholders = !firstSubject || !firstTouchsetBody.trim();

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-100 dark:border-zinc-900 bg-zinc-50/50 dark:bg-zinc-900/30">
        <div className="flex items-center gap-1.5 min-w-0">
          <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">Touch 1: live preview</span>
        </div>
        {usingPlaceholders && (
          <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-600 shrink-0">using placeholder copy</span>
        )}
      </div>
      <div className="p-3 space-y-2 bg-white dark:bg-zinc-950">
        <p className="text-xs">
          <span className="text-zinc-400 dark:text-zinc-600 font-mono text-[10px] uppercase tracking-wide mr-1.5">Subject</span>
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">{subject}</span>
        </p>
        <p className="text-xs text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">{body}</p>
      </div>
      <p className="px-3 py-1.5 text-[10px] text-zinc-400 dark:text-zinc-600 leading-relaxed border-t border-zinc-100 dark:border-zinc-900">
        Assembled the same way copy-engine.ts's upload mode does. This is exactly what a lead would receive, not a
        mockup. {"{company_name}"} and similar tokens resolve per-lead at send time.
      </p>
    </div>
  );
}
