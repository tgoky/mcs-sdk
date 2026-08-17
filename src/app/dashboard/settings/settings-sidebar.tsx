"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  User, 
  KeyRound, 
  RefreshCw, 
  Grid, 
  Bell, 
  Globe, 
  Settings2, 
  Users, 
  CreditCard 
} from "lucide-react";

interface NavGroup {
  title: string;
  items: {
    label: string;
    href: string;
    icon: React.ElementType;
  }[];
}

const SETTINGS_NAV_GROUPS: NavGroup[] = [
  {
    title: "General Settings",
    items: [
      { label: "Apps", href: "/dashboard/settings/apps", icon: Grid },
      { label: "Account", href: "/dashboard/settings/profile", icon: User },
      { label: "Notifications", href: "/dashboard/settings/notifications", icon: Bell },
      { label: "Connections", href: "/dashboard/settings/connections", icon: KeyRound },
      { label: "Booking Sync", href: "/dashboard/settings/booking-sync", icon: RefreshCw },
    ],
  },
  {
    title: "Workspace Settings",
    items: [
      { label: "General", href: "/dashboard/settings/workspace", icon: Settings2 },
      { label: "Members", href: "/dashboard/settings/members", icon: Users },
      { label: "Billing", href: "/dashboard/settings/billing", icon: CreditCard },
    ],
  },
];

export function SettingsSidebar() {
  const pathname = usePathname();

  return (
    <nav className="w-56 space-y-6 py-2">
      {SETTINGS_NAV_GROUPS.map((group) => (
        <div key={group.title} className="space-y-1.5">
          <h3 className="px-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            {group.title}
          </h3>
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive =
                pathname === item.href ||
                (item.href === "/dashboard/settings/profile" && pathname === "/dashboard/settings");

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2 text-xs rounded-lg transition-all ${
                    isActive
                      ? "bg-zinc-800/80 text-zinc-100 font-medium shadow-xs border border-zinc-700/50"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60"
                  }`}
                >
                  <Icon
                    size={16}
                    className={`shrink-0 ${
                      isActive ? "text-zinc-100" : "text-zinc-400"
                    }`}
                  />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}