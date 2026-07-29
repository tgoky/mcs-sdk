"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X, type LucideIcon } from "lucide-react";

/**
 * Centered dialog for the larger settings forms an ActionMenu item opens
 * (edit stack settings, update credentials, delete client, per-run actions
 * that need more than one line). The menu itself stays small and anchored
 * like the reference "what's new" popover; anything that needs real form
 * space graduates to this instead of being crammed into the dropdown.
 */
export function Modal({
  title,
  icon: Icon,
  onClose,
  children,
  maxWidthClass = "max-w-lg",
}: {
  title: string;
  icon?: LucideIcon;
  onClose: () => void;
  children: ReactNode;
  maxWidthClass?: string;
}) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-start sm:items-center justify-center bg-black/40 dark:bg-black/60 backdrop-blur-[2px] p-4 overflow-y-auto motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`w-full ${maxWidthClass} my-8 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-2xl motion-safe:animate-in motion-safe:zoom-in-95 motion-safe:duration-150`}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-zinc-100 dark:border-zinc-900 sticky top-0 bg-white dark:bg-zinc-950 rounded-t-xl">
          <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5 uppercase tracking-wider font-mono">
            {Icon && <Icon className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" />}
            {title}
          </p>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-zinc-400 dark:text-zinc-600 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors cursor-pointer p-1 -m-1 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 max-h-[75vh] overflow-y-auto">{children}</div>
      </div>
    </div>,
    document.body
  );
}
