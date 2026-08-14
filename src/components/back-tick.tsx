"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { usePreviousPage } from "./breadcrumbs/breadcrumb-context";

/**
 * A real button-shaped back affordance — border, subtle depth, hover
 * lift — instead of a bare colored-text link with a chevron or (worse) a
 * literal "←" character glyph.
 *
 * `href`/`label` are a FALLBACK, not the primary destination. Whenever
 * this tab has a genuine previous page in its session — the normal case,
 * since people arrive here by clicking from Live Executions, Queue, a
 * client, the Library, another run, etc. — BackLink returns there, named
 * for what it actually is ("Back to Queue", "Back to Sarah's Workspace"),
 * instead of always jumping to one hardcoded destination regardless of
 * how the person actually got here. The fallback only fires on a fresh
 * tab, a hard refresh, or a bookmarked/shared deep link, where there's
 * genuinely no "back" to return to.
 *
 * Needs "use client" for usePreviousPage() — still drops into a Server
 * Component page (engagements/[id]/page.tsx) exactly as before, Next.js
 * just renders it as an island.
 */
export function BackLink({ href, label }: { href: string; label: string }) {
  const previous = usePreviousPage();
  const target = previous ? { href: previous.href, label: `Back to ${previous.label}` } : { href, label };

  return (
    <Link
      href={target.href}
      className="group inline-flex w-fit items-center gap-1.5 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 py-1 pl-2 pr-3 text-xs font-semibold text-zinc-600 dark:text-zinc-400 shadow-sm transition-all hover:border-zinc-300 hover:text-zinc-900 hover:shadow-md dark:hover:border-zinc-700 dark:hover:text-zinc-100"
    >
      <ArrowLeft
        size={13}
        className="shrink-0 transition-transform duration-150 group-hover:-translate-x-0.5"
      />
      <span className="truncate">{target.label}</span>
    </Link>
  );
}
