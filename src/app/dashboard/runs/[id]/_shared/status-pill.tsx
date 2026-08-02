import { cn } from "@/lib/utils";

type Tone = "success" | "warning" | "danger" | "info" | "neutral";

const TONE_CLASSES: Record<Tone, string> = {
  success: "bg-emerald-950/60 text-emerald-400 border-emerald-800/60",
  warning: "bg-orange-950/50 text-orange-400 border-orange-800/50",
  danger: "bg-rose-950/60 text-rose-400 border-rose-800/60",
  info: "bg-sky-950/60 text-sky-400 border-sky-800/60",
  neutral: "bg-zinc-800/60 text-zinc-400 border-zinc-700/60",
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
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        TONE_CLASSES[tone],
        className
      )}
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
