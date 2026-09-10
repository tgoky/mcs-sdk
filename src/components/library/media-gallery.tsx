"use client";

// src/components/library/media-gallery.tsx
//
// Restored from the pre-two-tier Library (see git history around
// afcb504) — a horizontal screenshot carousel at the top of a Worker's
// own page, one real interface screenshot per Skill. Genuinely
// product-specific: only Showtime has these 5 screenshots on disk
// (public/images/{sts,prec,cabr,brec,fudit}.jpeg) from when this
// existed before, so a Worker with no playbook images just doesn't
// render a gallery (see product-detail-client.tsx) rather than show
// broken image tiles for Reputation Manager's skills.

import { useRef, useState, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface MediaGalleryItem {
  id: string;
  name: string;
  badge: string;
  image: string;
}

export function MediaGallery({ items }: { items: MediaGalleryItem[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScroll = () => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setCanScrollLeft(scrollLeft > 10);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
  };

  useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (el) {
      el.addEventListener("scroll", checkScroll);
      window.addEventListener("resize", checkScroll);
    }
    return () => {
      if (el) el.removeEventListener("scroll", checkScroll);
      window.removeEventListener("resize", checkScroll);
    };
  }, []);

  const scroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    const offset = scrollRef.current.clientWidth * 0.75;
    scrollRef.current.scrollBy({
      left: direction === "right" ? offset : -offset,
      behavior: "smooth",
    });
  };

  return (
    <div className="relative group/gallery">
      {canScrollLeft && (
        <button
          type="button"
          onClick={() => scroll("left")}
          aria-label="Scroll left"
          className="absolute left-3 top-1/2 -translate-y-1/2 z-20 surface-glass-2 text-zinc-900 dark:text-white p-3 rounded-full hover:scale-110 active:scale-95 transition-all cursor-pointer"
        >
          <ChevronLeft size={18} className="stroke-[2.5px]" />
        </button>
      )}

      {canScrollRight && (
        <button
          type="button"
          onClick={() => scroll("right")}
          aria-label="Scroll right"
          className="absolute right-3 top-1/2 -translate-y-1/2 z-20 surface-glass-2 text-zinc-900 dark:text-white p-3 rounded-full hover:scale-110 active:scale-95 transition-all cursor-pointer"
        >
          <ChevronRight size={18} className="stroke-[2.5px]" />
        </button>
      )}

      <div
        ref={scrollRef}
        className="flex gap-5 overflow-x-auto snap-x snap-mandatory pb-4 pt-1 scrollbar-none [scrollbar-width:none] [-ms-overflow-style:none]"
      >
        {items.map((item) => (
          <div key={item.id} className="shrink-0 w-[300px] sm:w-[420px] snap-start space-y-2 group">
            <div className="relative aspect-video w-full rounded-2xl surface-glass-1 overflow-hidden group-hover:border-zinc-400 dark:group-hover:border-zinc-700 transition-all">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.image}
                alt={item.name}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
            </div>
            <div className="flex items-center justify-between text-[11px] px-1">
              <span className="font-semibold text-zinc-800 dark:text-zinc-200 truncate">{item.name}</span>
              <span className="font-mono text-zinc-400 text-[10px] uppercase">({item.badge})</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
