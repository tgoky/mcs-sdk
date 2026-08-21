"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ArrowRight } from "lucide-react";

export function EnterDashboardBtn({
  href = "/dashboard",
  children = "Enter Dashboard",
  onNavigateStart,
}: {
  href?: string;
  children?: React.ReactNode;
  onNavigateStart?: () => void;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (isLoading) return;

    setIsLoading(true);
    if (onNavigateStart) onNavigateStart();

    // Smooth transition window to let the backdrop portal-zoom play out
    setTimeout(() => {
      router.push(href);
    }, 300);
  };

  return (
    <div className="relative group w-full sm:w-auto">
      {/* Ambient Glow Halo */}
      <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-white/30 via-zinc-400/20 to-white/30 opacity-0 group-hover:opacity-100 blur-md transition duration-500 group-hover:duration-200" />

      <button
        onClick={handleClick}
        disabled={isLoading}
        className={`
          relative w-full sm:w-auto h-12 px-8 
          bg-white text-black text-sm font-semibold 
          rounded-full flex items-center justify-center gap-2
          transform transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]
          hover:scale-[1.02] active:scale-[0.97] hover:bg-zinc-100
          shadow-[0_0_20px_rgba(255,255,255,0.12)]
          hover:shadow-[0_0_30px_rgba(255,255,255,0.28)]
          disabled:opacity-85 disabled:cursor-wait overflow-hidden
        `}
      >
        {/* Shimmer Light Sweep */}
        <span className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-black/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-in-out" />

        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin text-black" />
            <span>Entering Workspace...</span>
          </>
        ) : (
          <>
            <span>{children}</span>
            <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
          </>
        )}
      </button>
    </div>
  );
}