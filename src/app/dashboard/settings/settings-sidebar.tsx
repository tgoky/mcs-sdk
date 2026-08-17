"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  Wrench, 
  User, 
  Bell, 
  Globe, 
  Settings, 
  Users, 
  CreditCard,
  KeyRound,
  RefreshCw
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
    title: "GENERAL SETTINGS",
    items: [
      { label: "Apps", href: "/dashboard/settings/apps", icon: Wrench },
      { label: "Account", href: "/dashboard/settings/profile", icon: User },
      // { label: "Notifications", href: "/dashboard/settings/notifications", icon: Bell },
      { label: "Timezones & Region", href: "/dashboard/settings/language", icon: Globe },
      { label: "Connections", href: "/dashboard/settings/connections", icon: KeyRound },
      { label: "Booking Sync", href: "/dashboard/settings/booking-sync", icon: RefreshCw },
    ],
  },
  {
    title: "WORKSPACE SETTINGS",
    items: [
      { label: "General", href: "/dashboard/settings/workspace", icon: Settings },
      { label: "Members", href: "/dashboard/settings/members", icon: Users },
      { label: "Billing", href: "/dashboard/settings/billing", icon: CreditCard },
    ],
  },
];

export function SettingsSidebar() {
  const pathname = usePathname();

  return (
    <nav className="w-60 shrink-0 space-y-6 py-1 border-r border-zinc-200 dark:border-zinc-800/60 pr-4 min-h-screen">
      {SETTINGS_NAV_GROUPS.map((group) => (
        <div key={group.title} className="space-y-2">
          <h3 className="px-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-500">
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
                  className={`flex items-center gap-2.5 px-2 py-1.5 text-sm rounded-md transition-colors ${
                    isActive
                      ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium"
                      : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                  }`}
                >
                  <Icon
                    size={16}
                    className={`shrink-0 ${
                      isActive
                        ? "text-zinc-900 dark:text-zinc-100"
                        : "text-zinc-500 dark:text-zinc-400"
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