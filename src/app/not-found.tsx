import { Compass } from "lucide-react";
import { BackLink } from "@/components/back-link";

/**
 * Verified-defect fix (2026-08-08 handoff, defect #3). Before this file
 * existed, Next.js had no not-found.tsx anywhere in src/app/ or any
 * nested route, so a typo'd URL (or a shared broken link) rendered the
 * stock framework 404 with zero branding. A single root-level file here
 * is enough — Next.js falls back to the nearest ancestor not-found.tsx
 * for any route segment that doesn't define its own, so this now covers
 * every unmatched route in the app.
 *
 * Deliberately independent of the dashboard shell (no sidebar, no auth
 * check) — a 404 by definition means the router couldn't resolve a real
 * page, so it shouldn't assume dashboard chrome is available or that the
 * visitor is signed in. Styled off the same tokens as
 * dashboard/error.tsx and BackLink for a consistent voice rather than
 * inventing a third visual register.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background px-4 text-foreground">
      <div className="max-w-sm space-y-4 text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-900">
          <Compass size={16} className="text-zinc-500 dark:text-zinc-400" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            This page doesn&apos;t exist
          </p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            The link might be old, or the address was typed wrong.
          </p>
        </div>
        <div className="flex items-center justify-center gap-3 pt-1">
          <BackLink href="/home" label="Back to Home" />
        </div>
      </div>
    </div>
  );
}
