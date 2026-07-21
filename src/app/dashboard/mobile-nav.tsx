"use client";

import { useState } from "react";
import { Home } from "lucide-react";

interface NavLink {
  href: string;
  label: string;
}

export function MobileNav({ links, displayName }: { links: NavLink[]; displayName?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden">
      {/* Hamburger button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex flex-col justify-center items-center w-8 h-8 space-y-1 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors cursor-pointer"
        aria-label="Toggle menu"
      >
        <span
          className={`block h-px w-5 bg-current transition-transform duration-200 ${
            open ? "rotate-45 translate-y-1.5" : ""
          }`}
        />
        <span
          className={`block h-px w-5 bg-current transition-opacity duration-200 ${
            open ? "opacity-0" : ""
          }`}
        />
        <span
          className={`block h-px w-5 bg-current transition-transform duration-200 ${
            open ? "-rotate-45 -translate-y-1.5" : ""
          }`}
        />
      </button>

      {/* Dropdown overlay panel slots */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/40 dark:bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setOpen(false)}
          />
          {/* Menu panel */}
          <div className="fixed top-14 left-0 right-0 z-50 bg-white dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-900 py-3 px-4 space-y-1 shadow-md dark:shadow-xl transition-all duration-200 animate-in fade-in slide-in-from-top-2 duration-150">
            <a
              href="/home"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 mb-1 pb-3 border-b border-zinc-200 dark:border-zinc-900 text-sm font-semibold font-mono rounded-lg text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-zinc-200 transition-all"
            >
              <Home size={15} />
              Home
            </a>
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="block px-3 py-2 text-sm font-semibold font-mono rounded-lg text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-zinc-200 transition-all"
              >
                {link.label}
              </a>
            ))}
            {displayName && (
              <div className="flex items-center justify-between pt-3 mt-2 border-t border-zinc-200 dark:border-zinc-900 px-3">
                <span className="text-sm text-zinc-800 dark:text-zinc-300 font-bold font-mono truncate max-w-[160px]">
                  {displayName}
                </span>
                <a
                  href="/api/auth/logout"
                  
                  className="text-xs font-mono text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
                >
                  Sign out
                </a>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}