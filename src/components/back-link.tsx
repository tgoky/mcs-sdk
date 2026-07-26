import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/**
 * A real button-shaped back affordance — border, subtle depth, hover
 * lift — instead of a bare colored-text link with a chevron or (worse) a
 * literal "←" character glyph. No "use client" needed: the only
 * interactivity is CSS :hover, so this drops straight into a Server
 * Component page (engagements/[id]/page.tsx) as easily as a client one
 * (runs/[id]/page.tsx).
 */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="group inline-flex w-fit items-center gap-1.5 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 py-1 pl-2 pr-3 text-xs font-semibold text-zinc-600 dark:text-zinc-400 shadow-sm transition-all hover:border-zinc-300 hover:text-zinc-900 hover:shadow-md dark:hover:border-zinc-700 dark:hover:text-zinc-100"
    >
      <ArrowLeft
        size={13}
        className="shrink-0 transition-transform duration-150 group-hover:-translate-x-0.5"
      />
      <span className="truncate">{label}</span>
    </Link>
  );
}
