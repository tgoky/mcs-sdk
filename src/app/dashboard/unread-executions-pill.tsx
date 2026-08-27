"use client";

import { ArrowDown } from "lucide-react";

interface UnreadExecutionsPillProps {
  count: number;
  targetId?: string;
}

export function UnreadExecutionsPill({
  count,
  targetId = "live-executions-section",
}: UnreadExecutionsPillProps) {
  if (count <= 0) return null;

  const handleScroll = () => {
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