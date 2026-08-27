"use client";

import { useState } from "react";
import { ArrowDown } from "lucide-react";

interface UnreadExecutionsPillProps {
  count: number;
  targetId?: string;
}

export function UnreadExecutionsPill({
  count,
  targetId = "live-executions-section",
}: UnreadExecutionsPillProps) {
  const [dismissed, setDismissed] = useState(false);

  if (count <= 0 || dismissed) return null;

  const handleScroll = () => {
    // 1. Hide pill immediately on click
    setDismissed(true);

    // 2. Persist to DB right away so refreshes won't show it again
    fetch("/api/skill-runs/mark-seen", { method: "POST" }).catch(() => {});

    // 3. Smooth scroll
    const target = document.getElementById(targetId);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <button
      onClick={handleScroll}
      type="button"
      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#d946ef] hover:bg-[#c026d3] active:scale-95 text-white text-xs font-semibold shadow-md hover:shadow-lg transition-all cursor-pointer"
      title={`Scroll to ${count} new execution${count === 1 ? "" : "s"}`}
    >
      <span>{count} unread</span>
      <ArrowDown className="w-3.5 h-3.5 stroke-[2.5] animate-bounce" />
    </button>
  );
}