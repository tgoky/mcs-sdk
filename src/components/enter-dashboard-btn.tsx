"use client";

import { useRouter } from "next/navigation";

export function EnterDashboardBtn({
  href = "/dashboard",
  children = "Enter Dashboard",
  onNavigateStart,
}: {
  href?: string;
  children?: React.ReactNode;
  onNavigateStart?: () => void;
}) {
  const router = useRouter();

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();

    // Trigger the background zoom-in transition on LandingWrapper
    if (onNavigateStart) onNavigateStart();

    // Navigate immediately without artificial delay or spinning cursors
    router.push(href);
  };

  return (
    <button
      onClick={handleClick}
      className="relative group w-full sm:w-auto sm:min-w-[280px] h-12 px-16 bg-white text-black text-sm font-semibold rounded-none flex items-center justify-center transform transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:scale-[1.02] active:scale-[0.97] hover:bg-zinc-100 overflow-hidden cursor-pointer"
    >
      <span className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-black/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-in-out" />
      <span>{children}</span>
    </button>
  );
}