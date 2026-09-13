// src/components/simple-markdown.tsx
//
// A small, dependency-free renderer for the specific markdown subset the
// LLM-generated reports actually produce (Leak Map's executive report,
// audit-engine.ts — headers, bold/italic, horizontal rules, bullet lists,
// a "|"-delimited table, plain paragraphs). Not a general CommonMark
// parser — no node_modules markdown library is pulled in for one report
// view; this covers exactly what's needed instead of the raw "#"/"**"
// literally showing up on screen.

import React from "react";
import { AlertTriangle, HelpCircle, ArrowRight, Target } from "lucide-react";

// Section headings the audit-engine prompt reliably produces (severity
// verdict, data-gap callouts, next-step guidance) get a small icon so they
// read as labeled signals to act on, not just another bold sentence in the
// flow. Keyword-matched rather than exact-string, since the LLM's own
// wording for these varies run to run; anything that doesn't match renders
// exactly as before.
const HEADING_ICONS: { pattern: RegExp; Icon: React.ElementType }[] = [
  { pattern: /severity/i, Icon: AlertTriangle },
  { pattern: /data gaps?/i, Icon: HelpCircle },
  { pattern: /(what happens next|next steps)/i, Icon: ArrowRight },
  { pattern: /(recommend|action items?)/i, Icon: Target },
];

function iconForHeading(text: string): React.ElementType | null {
  return HEADING_ICONS.find((h) => h.pattern.test(text))?.Icon ?? null;
}

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const regex = /\*\*(.+?)\*\*|\*(.+?)\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    if (match[1] !== undefined) {
      nodes.push(
        <strong key={`${keyPrefix}-b-${i}`} className="font-semibold text-zinc-900 dark:text-zinc-100">
          {match[1]}
        </strong>
      );
    } else if (match[2] !== undefined) {
      nodes.push(<em key={`${keyPrefix}-i-${i}`}>{match[2]}</em>);
    }
    i++;
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

const HEADING_RE = /^(#{1,3})\s+(.*)$/;
const LIST_RE = /^[-*]\s+(.*)$/;
const HR_RE = /^-{3,}$/;
const TABLE_SEPARATOR_RE = /^[\s|:-]+$/;

export function SimpleMarkdown({ text, className }: { text: string; className?: string }) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  let listBuffer: string[] = [];

  function flushList() {
    if (listBuffer.length === 0) return;
    const items = listBuffer;
    listBuffer = [];
    blocks.push(
      <ul key={`ul-${key++}`} className="list-disc pl-5 space-y-1.5 my-2.5">
        {items.map((item, idx) => (
          <li key={idx} className="leading-relaxed">
            {renderInline(item, `li-${key}-${idx}`)}
          </li>
        ))}
      </ul>
    );
  }

  while (i < lines.length) {
    const trimmed = lines[i].trim();

    if (trimmed === "") {
      flushList();
      i++;
      continue;
    }

    if (HR_RE.test(trimmed)) {
      flushList();
      blocks.push(<hr key={`hr-${key++}`} className="my-4 border-zinc-200 dark:border-zinc-800" />);
      i++;
      continue;
    }

    const heading = HEADING_RE.exec(trimmed);
    if (heading) {
      flushList();
      const level = heading[1].length;
      const content = renderInline(heading[2], `h-${key}`);
      // Level-1 headings mark a whole new major section of the report
      // (e.g. "Metric-by-Metric Review" vs. "Recommendation Cards" vs.
      // "Data Gaps") — these need a real, unambiguous break, not just a
      // little extra margin, or one section's last line reads as if it
      // could belong to the next section's heading. A top divider + much
      // more vertical room does that; level 2/3 stay lighter since those
      // are sub-items within a section, not section boundaries.
      const cls =
        level === 1
          ? "flex items-center gap-2 text-lg font-bold text-zinc-900 dark:text-zinc-100 mt-14 mb-4 pt-8 border-t border-zinc-300 dark:border-zinc-700 first:mt-0 first:pt-0 first:border-t-0"
          : level === 2
          ? "flex items-center gap-1.5 text-sm font-bold text-zinc-900 dark:text-zinc-100 mt-8 mb-2 first:mt-0"
          : "flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-400 mt-4 mb-1.5 first:mt-0";
      const HeadingIcon = iconForHeading(heading[2]);
      const headingKey = key++;
      const headingContent = (
        <>
          {HeadingIcon && (
            <HeadingIcon size={level === 1 ? 17 : level === 3 ? 12 : 14} className="shrink-0 text-zinc-500 dark:text-zinc-400" />
          )}
          {content}
        </>
      );
      if (level === 1) blocks.push(<h3 key={headingKey} className={cls}>{headingContent}</h3>);
      else if (level === 2) blocks.push(<h4 key={headingKey} className={cls}>{headingContent}</h4>);
      else blocks.push(<h5 key={headingKey} className={cls}>{headingContent}</h5>);
      i++;
      continue;
    }

    const list = LIST_RE.exec(trimmed);
    if (list) {
      listBuffer.push(list[1]);
      i++;
      continue;
    }

    // A header row containing "|" whose next line is a "---|---" style
    // separator — the pipe-table format the audit prompt asks for.
    if (trimmed.includes("|") && lines[i + 1] && TABLE_SEPARATOR_RE.test(lines[i + 1].trim()) && lines[i + 1].includes("-")) {
      flushList();
      const headerCells = trimmed.split("|").map((c) => c.trim()).filter(Boolean);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().includes("|")) {
        rows.push(lines[i].split("|").map((c) => c.trim()).filter(Boolean));
        i++;
      }
      const tableKey = key++;
      blocks.push(
        <div key={tableKey} className="overflow-x-auto my-3">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr>
                {headerCells.map((c, idx) => (
                  <th
                    key={idx}
                    className="text-left font-bold text-zinc-700 dark:text-zinc-300 border-b border-zinc-200 dark:border-zinc-800 px-2 py-1.5"
                  >
                    {renderInline(c, `th-${tableKey}-${idx}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ridx) => (
                <tr key={ridx} className="border-b border-zinc-100 dark:border-zinc-800/60">
                  {r.map((c, cidx) => (
                    <td key={cidx} className="px-2 py-1.5 text-zinc-700 dark:text-zinc-300 align-top">
                      {renderInline(c, `td-${tableKey}-${ridx}-${cidx}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Paragraph: consume consecutive plain lines until a blank line or the
    // start of another block type.
    flushList();
    const paraLines: string[] = [trimmed];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !HEADING_RE.test(lines[i].trim()) &&
      !LIST_RE.test(lines[i].trim()) &&
      !HR_RE.test(lines[i].trim())
    ) {
      paraLines.push(lines[i].trim());
      i++;
    }

    // A one-line paragraph that's entirely "**bold**" (this report's own
    // convention for a per-metric sub-head, not a real heading) directly
    // followed by a bullet list — group both into one visually distinct
    // segment instead of two loose blocks with nothing to tell them apart
    // from the next sub-head + list right after it.
    const boldOnly = paraLines.length === 1 ? /^\*\*(.+)\*\*$/.exec(paraLines[0]) : null;
    if (boldOnly && i < lines.length && LIST_RE.test(lines[i].trim())) {
      const segItems: string[] = [];
      while (i < lines.length) {
        const m = LIST_RE.exec(lines[i].trim());
        if (!m) break;
        segItems.push(m[1]);
        i++;
      }
      const segKey = key++;
      blocks.push(
        <div key={segKey} className="border-t border-zinc-200/60 dark:border-zinc-800/60 pt-3 mt-3 first:mt-0 first:border-t-0 first:pt-0">
          <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-1.5">
            {renderInline(boldOnly[1], `seg-h-${segKey}`)}
          </p>
          <ul className="list-disc pl-5 space-y-1">
            {segItems.map((item, idx) => (
              <li key={idx} className="leading-relaxed">
                {renderInline(item, `seg-li-${segKey}-${idx}`)}
              </li>
            ))}
          </ul>
        </div>
      );
      continue;
    }

    const paraKey = key++;
    blocks.push(
      <p key={paraKey} className="leading-relaxed my-2">
        {renderInline(paraLines.join(" "), `p-${paraKey}`)}
      </p>
    );
  }
  flushList();

  return <div className={className}>{blocks}</div>;
}
