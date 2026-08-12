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
    <nav className="space-y-1 py-1">
      {SETTINGS_NAV.map((item) => {
        const Icon = item.icon;
        const isActive =
          pathname === item.href ||
          (item.href === "/dashboard/settings/profile" && pathname === "/dashboard/settings");

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 px-3 py-2.5 text-sm rounded-xl transition-all ${
              isActive
                ? "bg-zinc-100 text-zinc-950 font-semibold shadow-xs"
                : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/60 font-medium"
            }`}
          >
            <Icon
              size={18}
              className={`shrink-0 ${
                isActive ? "text-zinc-950" : "text-zinc-400"
              }`}
            />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}