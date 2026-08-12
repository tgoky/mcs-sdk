"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { User, KeyRound, RefreshCw } from "lucide-react";

const SETTINGS_NAV = [
  { label: "Profile", href: "/dashboard/settings/profile", icon: User },
  { label: "Connections", href: "/dashboard/settings/connections", icon: KeyRound },
  { label: "Booking Sync", href: "/dashboard/settings/booking-sync", icon: RefreshCw },
];

export function SettingsSidebar() {
  const pathname = usePathname();

  return (
    <nav className="space-y-0.5">
      {SETTINGS_NAV.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href || (item.href === "/dashboard/settings/profile" && pathname === "/dashboard/settings");

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-md transition-colors ${
              isActive
                ? "bg-zinc-800 text-zinc-100 font-semibold"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60"
            }`}
          >
            <Icon size={14} className={isActive ? "text-zinc-100" : "text-zinc-500"} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}