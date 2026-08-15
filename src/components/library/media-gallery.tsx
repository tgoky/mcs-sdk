"use client";

import { useRef, useState, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { SKILL_MANIFEST, type SkillId } from "@/lib/skill-manifest";

interface PlaybookItem {
  id: SkillId;
  badge: string;
  image: string;
}

export function MediaGallery({ items }: { items: PlaybookItem[] }) {
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
      {/* Floating Glassmorphism Previous Button */}
      {canScrollLeft && (
        <button
          type="button"
          onClick={() => scroll("left")}
          aria-label="Scroll left"
          className="absolute left-3 top-1/2 -translate-y-1/2 z-20 backdrop-blur-md bg-white/70 dark:bg-zinc-950/70 border border-white/60 dark:border-zinc-700/60 shadow-xl text-zinc-900 dark:text-white p-3 rounded-full hover:scale-110 active:scale-95 transition-all cursor-pointer"
        >
          <ChevronLeft size={18} className="stroke-[2.5px]" />
        </button>
      )}

      {/* Floating Glassmorphism Next Button */}
      {canScrollRight && (
        <button
          type="button"
          onClick={() => scroll("right")}
          aria-label="Scroll right"
          className="absolute right-3 top-1/2 -translate-y-1/2 z-20 backdrop-blur-md bg-white/70 dark:bg-zinc-950/70 border border-white/60 dark:border-zinc-700/60 shadow-xl text-zinc-900 dark:text-white p-3 rounded-full hover:scale-110 active:scale-95 transition-all cursor-pointer"
        >
          <ChevronRight size={18} className="stroke-[2.5px]" />
        </button>
      )}

      {/* Scrollable Gallery Rail */}
      <div
        ref={scrollRef}
        className="flex gap-5 overflow-x-auto snap-x snap-mandatory pb-4 pt-1 scrollbar-none [scrollbar-width:none] [-ms-overflow-style:none]"
      >
        {items.map((pb) => {
          const manifest = SKILL_MANIFEST[pb.id];
          return (
            <div key={pb.id} className="shrink-0 w-[300px] sm:w-[420px] snap-start space-y-2 group">
              <div className="relative aspect-video w-full rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 overflow-hidden shadow-sm group-hover:border-zinc-400 dark:group-hover:border-zinc-700 transition-all">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={pb.image}
                  alt={manifest.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              </div>
              <div className="flex items-center justify-between text-[11px] px-1">
                <span className="font-semibold text-zinc-800 dark:text-zinc-200 truncate">{manifest.name}</span>
                <span className="font-mono text-zinc-400 text-[10px] uppercase">({pb.badge})</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}