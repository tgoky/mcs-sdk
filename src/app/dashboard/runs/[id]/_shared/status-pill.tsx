import { cn } from "@/lib/utils";

type Tone = "success" | "warning" | "danger" | "info" | "neutral";

// ---------------------------------------------------------------------------
// This is now the ONE tone/color system for status pills in the app. It used
// to be redefined locally, slightly differently each time, in five other
// files (win-back-pipeline.tsx, master-roster-calendar.tsx, pile-on-pipeline.tsx,
// pre-call-read-pipeline.tsx, and this one) — which is exactly why a color
// fix approved in one place never reached the others.
//
// Direct feedback this addresses:
//   - "the border radius active in cadence label... I hate how they look" —
//     dropped the rounded/bordered/uppercase pill shape entirely. Every
//     tone now renders as plain bold colored text, same treatment
//     win-back-pipeline.tsx's "Active in cadence" already had — that page
//     was cited as the version to copy, so its style is now the shared
//     default instead of a one-off.
//   - No green for "success/done" states, no orange/gold for "active/
//     warning" states. Both live in the same lavender-slate family
//     (#424d77 light / #c5b7ea dark) already approved for "Active in
//     cadence" — reused verbatim rather than inventing a second shade.
//   - danger keeps a little more visual weight (border) than the rest —
//     a failed send is the one status where losing the visual "alert" cue
//     would make the log harder to scan for what needs attention.
// ---------------------------------------------------------------------------
const TONE_CLASSES: Record<Tone, string> = {
  success: "font-semibold text-[#424d77] dark:text-[#c5b7ea]",
  warning: "font-bold text-[#424d77] dark:text-[#c5b7ea]",
  danger:
    "font-semibold text-rose-700 dark:text-rose-400 border-b border-rose-300/70 dark:border-rose-800/70",
  info: "font-medium text-sky-700 dark:text-sky-400",
  neutral: "font-medium text-zinc-500 dark:text-zinc-400",
};

export function StatusPill({
  tone,
  children,
  className,
}: {
  tone: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 text-[11px] tracking-tight", TONE_CLASSES[tone], className)}
    >
      {children}
    </span>
  );
}

export function toneFromSeverity(severity: string | null | undefined): Tone {
  switch ((severity ?? "").toLowerCase()) {
    case "high":
      return "danger";
    case "medium":
      return "warning";
    case "low":
      return "info";
    default:
      return "neutral";
  }
}

export function toneFromEnrollmentStatus(status: string | null | undefined): Tone {
  switch (status) {
    case "rebooked":
      return "success";
    case "reply_exited":
      return "info";
    case "lost":
      return "neutral";
    case "active":
    default:
      return "warning";
  }
}