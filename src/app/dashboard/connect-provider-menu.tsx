"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Radio, ChevronRight } from "lucide-react";

interface RecentEngagement {
  engagementId: string;
  buyer: string;
}

/**
 * Fix for the "Connect provider" sidebar link doing nothing: it used to be
 * a static <Link href="/dashboard/engagements"> with a tooltip explaining
 * Recall.ai is connected per-client — the tooltip told you where to go,
 * the link itself didn't take you there. Connecting Recall is inherently
 * per-client (there's no global "provider" to connect), so this renders a
 * small picker of recent clients and deep-links each one straight to its
 * Call Intelligence section via the same `?fixSection=conversation_intelligence`
 * param the "Connect Provider" button in deliverables-panel.tsx already
 * uses successfully (see edit-stack-settings.tsx, which auto-opens and
 * scrolls to that section when the param is present).
 */
export function ConnectProviderMenu({ recent }: { recent: RecentEngagement[] }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-400 hover:bg-[#dfd7ea] dark:hover:bg-zinc-900/40 hover:text-zinc-900 dark:hover:text-zinc-100 transition-all cursor-pointer"
      >
        <Radio className="w-4 h-4 text-zinc-500 dark:text-zinc-400 shrink-0" />
        <span className="flex flex-col items-start">
          <span>Connect provider</span>
          <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-normal">per client</span>
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-20 mt-1 w-64 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-lg overflow-hidden"
        >
          <div className="px-3 py-2 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 border-b border-zinc-100 dark:border-zinc-800">
            Connect Recall.ai for…
          </div>
          {recent.length > 0 ? (
            <div className="max-h-64 overflow-y-auto py-1">
              {recent.map((client) => (
                <Link
                  key={client.engagementId}
                  href={`/dashboard/engagements/${client.engagementId}?fixSection=conversation_intelligence`}
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-between gap-2 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition-colors"
                >
                  <span className="truncate">{client.buyer}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                </Link>
              ))}
            </div>
          ) : (
            <div className="px-3 py-3 text-xs text-zinc-500 dark:text-zinc-500">
              No clients yet — create one first, then connect Recall.ai from its Call Intelligence tab.
            </div>
          )}
          <Link
            href="/dashboard/engagements"
            onClick={() => setOpen(false)}
            className="block border-t border-zinc-100 dark:border-zinc-800 px-3 py-2 text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition-colors"
          >
            See all clients →
          </Link>
        </div>
      )}
    </div>
  );
}
