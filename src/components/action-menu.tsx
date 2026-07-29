"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { LucideIcon } from "lucide-react";

const PANEL_WIDTH = 300;
const EST_PANEL_HEIGHT = 340;
const VIEWPORT_MARGIN = 8;

/**
 * Floating action-menu panel — the "click a trigger, get a small anchored
 * card with grouped actions" pattern (product "what's new" popovers, GitHub's
 * repo settings menu, etc). Portal-rendered so it isn't clipped by any
 * overflow:hidden ancestor (tables, cards), positioned off the trigger's
 * own bounding rect the same way HoverPreview positions itself, and closes
 * on outside click, Escape, or scroll/resize.
 *
 * `children` can be a plain node or a render-prop taking `close` — most
 * items want to dismiss the menu after firing their action.
 */
export function ActionMenu({
  trigger,
  children,
  align = "end",
  panelWidth = PANEL_WIDTH,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: "start" | "end";
  panelWidth?: number;
}) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; flipped: boolean } | null>(null);

  function toggle() {
    setOpen((o) => !o);
  }
  function close() {
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();

    const spaceBelow = window.innerHeight - rect.bottom;
    const flipped = spaceBelow < EST_PANEL_HEIGHT && rect.top > EST_PANEL_HEIGHT;
    const top = flipped ? rect.top - VIEWPORT_MARGIN : rect.bottom + 6;

    let left = align === "end" ? rect.right - panelWidth : rect.left;
    left = Math.min(Math.max(VIEWPORT_MARGIN, left), window.innerWidth - panelWidth - VIEWPORT_MARGIN);

    setCoords({ top, left, flipped });
  }, [open, align, panelWidth]);

  useEffect(() => {
    if (!open) return;

    function onDocMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (anchorRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      close();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    function onScrollOrResize() {
      close();
    }

    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open]);

  return (
    <div ref={anchorRef} className="inline-flex">
      {trigger({ open, toggle })}
      {open &&
        coords &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            style={{
              position: "fixed",
              top: coords.flipped ? undefined : coords.top,
              bottom: coords.flipped ? window.innerHeight - coords.top : undefined,
              left: coords.left,
              width: panelWidth,
              zIndex: 9999,
            }}
            className={`motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-150 ${
              coords.flipped ? "motion-safe:origin-bottom-right" : "motion-safe:origin-top-right"
            }`}
          >
          <div
  ref={panelRef}
  role="menu"
  className="rounded-2xl border border-zinc-800 bg-black/95 backdrop-blur-md text-zinc-100 shadow-2xl shadow-black/80 py-1.5 max-h-[70vh] overflow-y-auto"
>
              {typeof children === "function" ? children(close) : children}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

export function ActionMenuSection({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="px-1.5 py-1">
      {label && (
        <p className="px-2.5 pb-1 pt-1 text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider truncate">
          {label}
        </p>
      )}
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

export function ActionMenuDivider() {
  return <div className="my-1 border-t border-zinc-800/80" />;
}

export function ActionMenuItem({
  icon: Icon,
  label,
  description,
  onClick,
  href,
  tone = "default",
  disabled = false,
  trailing,
}: {
  icon?: LucideIcon;
  label: string;
  description?: string;
  onClick?: () => void;
  href?: string;
  tone?: "default" | "danger" | "accent";
  disabled?: boolean;
  trailing?: ReactNode;
}) {
  const toneClass =
    tone === "danger"
      ? "text-rose-400 hover:bg-rose-500/15"
      : tone === "accent"
      ? "text-amber-400 hover:bg-amber-400/10"
      : "text-zinc-200 hover:bg-zinc-800/80";

  const iconClass =
    tone === "danger"
      ? "text-rose-400"
      : tone === "accent"
      ? "text-amber-400"
      : "text-zinc-400";

  const content = (
    <>
      {Icon && <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${iconClass}`} />}
      <span className="flex-1 min-w-0">
        <span className="block text-[13px] font-medium leading-tight">{label}</span>
        {description && (
          <span className="block text-[11px] text-zinc-400 font-mono leading-snug mt-0.5">
            {description}
          </span>
        )}
      </span>
      {trailing}
    </>
  );

  const cls = `w-full flex items-start gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors ${
    disabled ? "opacity-40 cursor-not-allowed" : `cursor-pointer ${toneClass}`
  }`;

  if (href && !disabled) {
    return (
      <a href={href} className={cls} role="menuitem">
        {content}
      </a>
    );
  }
  return (
    <button onClick={onClick} disabled={disabled} className={cls} role="menuitem" type="button">
      {content}
    </button>
  );
}