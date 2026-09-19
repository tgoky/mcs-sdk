"use client";

// Phase 3's "preview-first entry point" for ICP Lock — a genuinely
// different resolution from Pin-Down's (see pin-down-live-preview.tsx's
// own header). ICP Lock has no rendered artifact at all: its output is
// structured targeting data (ICP rows + sizing bounds) that Voice
// Capture, Source Connect, Send Connect, and Daily Send read, not a
// document a person looks at. So the honest "preview" here isn't a
// generated page — it's a live-updating summary of the actual targeting
// profile Cold Open will use, shown with placeholder example values
// before any real ICP is entered, converging to the real thing as rows
// are filled in. Same "placeholder result before any real input"
// principle as Pin-Down's, applied to what this worker actually produces.

import { Sparkles } from "lucide-react";
import type { IcpRow } from "./icp-lock-config-form";

const PLACEHOLDER_ROW: IcpRow = {
  slug: "boutique-agency",
  label: "Boutique agencies",
  weight: "0.6",
  teamSizeMin: "",
  teamSizeMax: "30",
  disqualifyIf: "team_size > 50",
};

function describeRow(row: IcpRow): string {
  const parts: string[] = [];
  if (row.teamSizeMin || row.teamSizeMax) {
    const min = row.teamSizeMin || "0";
    const max = row.teamSizeMax || "any";
    parts.push(`${min}–${max} team members`);
  }
  if (row.disqualifyIf.trim()) {
    parts.push(`disqualify if ${row.disqualifyIf.trim()}`);
  }
  return parts.length > 0 ? parts.join(" · ") : "no sizing rules set yet";
}

export function IcpLockLivePreview({
  productName,
  productValueProp,
  icpRows,
}: {
  productName: string;
  productValueProp: string;
  icpRows: IcpRow[];
}) {
  const cleanRows = icpRows.filter((r) => r.slug.trim() && r.label.trim());
  const rowsToShow = cleanRows.length > 0 ? cleanRows : [PLACEHOLDER_ROW];
  const usingPlaceholder = cleanRows.length === 0;

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-100 dark:border-zinc-900 bg-zinc-50/50 dark:bg-zinc-900/30">
        <div className="flex items-center gap-1.5 min-w-0">
          <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">Who Cold Open will target — live preview</span>
        </div>
        {usingPlaceholder && (
          <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-600 shrink-0">using a placeholder example</span>
        )}
      </div>
      <div className="px-3 py-2.5 space-y-2">
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          Prospects hear about{" "}
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">{productName || "Growth Accelerator"}</span>
          {" — "}
          {productValueProp || "helps B2B teams close more deals faster"}.
        </p>
        <div className="space-y-1.5">
          {rowsToShow.map((row, i) => (
            <div key={row.slug || i} className="flex items-start gap-2 text-xs">
              <span className="shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
              <span className="text-zinc-700 dark:text-zinc-300">
                <span className="font-semibold">{row.label || row.slug}</span>
                {row.weight && <span className="text-zinc-400 dark:text-zinc-600"> ({Math.round(Number(row.weight) * 100) || row.weight}%)</span>}
                {" — "}
                {describeRow(row)}
              </span>
            </div>
          ))}
        </div>
      </div>
      <p className="px-3 py-1.5 text-[10px] text-zinc-400 dark:text-zinc-600 leading-relaxed border-t border-zinc-100 dark:border-zinc-900">
        Voice Capture, Source Connect, Send Connect, and Daily Send all read this once it's saved — nothing runs
        against it until then.
      </p>
    </div>
  );
}
