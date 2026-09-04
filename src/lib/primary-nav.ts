// Canonical top-level navigation. Work is the cross-product hallway; product
// sections own their product-specific secondary navigation.
import { BookOpen, LayoutGrid, MonitorPlay, Settings, ShieldCheck, type LucideIcon } from "lucide-react";
import type { ProductId } from "@/lib/product-catalog";

export interface PrimaryNavSection {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Kept optional for the mobile accordion's shared rendering path. Product
   * navigation currently owns its links in the secondary sidebar. */
  children?: { label: string; href: string; icon: LucideIcon }[];
}

export interface ProductNavSection extends PrimaryNavSection {
  productId: ProductId;
  iconSrc: string;
  color: "amber" | "indigo";
}

/** Destinations that are useful regardless of which products are installed. */
export const PRIMARY_NAV_SECTIONS: PrimaryNavSection[] = [
  { title: "Work", href: "/dashboard", icon: LayoutGrid },
  { title: "Library", href: "/dashboard/library", icon: BookOpen },
];

/** Product destinations only render once that product is installed in the
 * active workspace. This is intentionally distinct from the global rail. */
export const PRODUCT_NAV_SECTIONS: ProductNavSection[] = [
  {
    productId: "showtime",
    title: "Showtime",
    href: "/dashboard/showtime",
    icon: MonitorPlay,
    iconSrc: "/images/showtime.png",
    color: "amber",
  },
  {
    productId: "reputation-manager",
    title: "Reputation Manager",
    href: "/dashboard/reputation-manager",
    icon: ShieldCheck,
    iconSrc: "/images/repm.png",
    color: "indigo",
  },
];

export const SETTINGS_NAV = { label: "Settings", href: "/dashboard/settings", icon: Settings };
