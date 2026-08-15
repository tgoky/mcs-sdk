"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { PackageOverview } from "@/lib/package-overview";
import {
  Search,
  Settings,
  Star,
  Download,
  CheckCircle2,
  LayoutGrid,
  Gavel,
  Zap,
  Sparkles,
  BarChart3,
  RefreshCw,
  SlidersHorizontal,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";

interface MarketplaceItem {
  id: string;
  name: string;
  developer: string;
  category: "Revenue Execution" | "Onboarding" | "Sales Intelligence" | "Disputes & Compliance";
  collection: "Top Installed Apps" | "Newly Added Apps" | "AI Agents" | "Top Free Apps";
  description: string;
  rating: number;
  reviews: number;
  downloads: string;
  status: "installed" | "coming_soon" | "included";
  href?: string;
  icon: any;
  iconBg: string;
  iconColor: string;
}

export function LibraryMarketplaceClient({ overview }: { overview: PackageOverview }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCollection, setSelectedCollection] = useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  
  // Accordion toggle state for left sidebar
  const [openSections, setOpenSections] = useState({
    collections: true,
    categories: true,
    pricing: true,
  });

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const marketplaceItems: MarketplaceItem[] = useMemo(
    () => [
      {
        id: "showtime",
        name: "Showtime Core Suite",
        developer: "Showtime Core",
        category: "Revenue Execution",
        collection: "Top Installed Apps",
        description:
          "Sales execution for your booked calls — client setup, follow-up sequences, call briefs, win-back, and funnel health.",
        rating: 5.0,
        reviews: 24,
        downloads: `${overview.runsInWindow || 432}K`,
        status: "installed",
        href: "/dashboard/library/showtime",
        icon: LayoutGrid,
        iconBg: "bg-teal-500/10 border-teal-500/20",
        iconColor: "text-teal-600 dark:text-teal-400",
      },
      {
        id: "counter-claim",
        name: "Counter Claim",
        developer: "Mudd Labs",
        category: "Disputes & Compliance",
        collection: "Newly Added Apps",
        description:
          "Automated dispute responses for chargebacks — evidence packs and alerts generated as disputes come in.",
        rating: 4.9,
        reviews: 12,
        downloads: "127K",
        status: "coming_soon",
        href: "/dashboard/library/counter-claim",
        icon: Gavel,
        iconBg: "bg-amber-500/10 border-amber-500/20",
        iconColor: "text-amber-600 dark:text-amber-400",
      },
      {
        id: "pre-call-read",
        name: "Call Brief AI Agent",
        developer: "Showtime Core",
        category: "Sales Intelligence",
        collection: "AI Agents",
        description:
          "Nightly briefing cycle: researches tomorrow's booked calls using LinkedIn corroboration and pings Slack & CRM.",
        rating: 4.8,
        reviews: 19,
        downloads: "277K",
        status: "installed",
        href: "/dashboard/modules/pre-call-read",
        icon: Sparkles,
        iconBg: "bg-indigo-500/10 border-indigo-500/20",
        iconColor: "text-indigo-600 dark:text-indigo-400",
      },
      {
        id: "pile-on",
        name: "Pre-Call Follow-Up Stream",
        developer: "Showtime Core",
        category: "Revenue Execution",
        collection: "Top Installed Apps",
        description:
          "Enrolls booked prospects into multi-channel follow-up sequences and updates ad attribution cohorts in real time.",
        rating: 4.9,
        reviews: 31,
        downloads: "375K",
        status: "installed",
        href: "/dashboard/modules/pile-on",
        icon: Zap,
        iconBg: "bg-teal-500/10 border-teal-500/20",
        iconColor: "text-teal-600 dark:text-teal-400",
      },
      {
        id: "win-back",
        name: "Booking Recovery Engine",
        developer: "Showtime Core",
        category: "Revenue Execution",
        collection: "Top Free Apps",
        description:
          "Generates and manages a 30-day re-engagement cadence for cold prospects with single-use reschedule links.",
        rating: 4.9,
        reviews: 28,
        downloads: "182K",
        status: "installed",
        href: "/dashboard/modules/win-back",
        icon: RefreshCw,
        iconBg: "bg-rose-500/10 border-rose-500/20",
        iconColor: "text-rose-600 dark:text-rose-400",
      },
      {
        id: "leak-map",
        name: "Funnel Audit Diagnostic",
        developer: "Showtime Core",
        category: "Sales Intelligence",
        collection: "Top Free Apps",
        description:
          "Audits pipeline conversion drop-offs weekly, calculates financial revenue loss, and dispatches breach alerts.",
        rating: 5.0,
        reviews: 42,
        downloads: "103K",
        status: "installed",
        href: "/dashboard/modules/leak-map",
        icon: BarChart3,
        iconBg: "bg-emerald-500/10 border-emerald-500/20",
        iconColor: "text-emerald-600 dark:text-emerald-400",
      },
      {
        id: "pin-down",
        name: "Show Rate Onboarding Bridge",
        developer: "Showtime Core",
        category: "Onboarding",
        collection: "Newly Added Apps",
        description:
          "Learns client brand voice, drafts creative briefs and video scripts, and provisions booking webhooks on setup.",
        rating: 4.7,
        reviews: 15,
        downloads: "86K",
        status: "installed",
        href: "/dashboard/modules/pin-down",
        icon: SlidersHorizontal,
        iconBg: "bg-amber-500/10 border-amber-500/20",
        iconColor: "text-amber-600 dark:text-amber-400",
      },
    ],
    [overview.runsInWindow]
  );

  // Filter items based on active tab, sidebar selection, and search query
  const filteredItems = useMemo(() => {
    return marketplaceItems.filter((item) => {
      // Tab filter
      if (activeTab === "installed" && item.status !== "installed") return false;
      if (activeTab === "ai_agents" && item.collection !== "AI Agents") return false;
      if (activeTab === "coming_soon" && item.status !== "coming_soon") return false;

      // Sidebar collection filter
      if (selectedCollection !== "all" && item.collection !== selectedCollection) return false;

      // Sidebar category filter
      if (selectedCategory !== "all" && item.category !== selectedCategory) return false;

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        return (
          item.name.toLowerCase().includes(query) ||
          item.description.toLowerCase().includes(query) ||
          item.developer.toLowerCase().includes(query)
        );
      }

      return true;
    });
  }, [marketplaceItems, activeTab, selectedCollection, selectedCategory, searchQuery]);

  return (
    <div className="w-full space-y-6 font-sans">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
            Marketplace Apps
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Get more out of your CRM. Explore apps &amp; integrate them with your account seamlessly.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            className="inline-flex items-center gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm transition-colors"
          >
            <Settings size={14} /> Settings
          </button>
        </div>
      </div>

      {/* Primary Tab Navigation Bar */}
      <div className="flex items-center gap-6 border-b border-zinc-200 dark:border-zinc-800 overflow-x-auto scrollbar-none text-xs font-semibold">
        <button
          type="button"
          onClick={() => setActiveTab("all")}
          className={`pb-3 transition-colors whitespace-nowrap border-b-2 ${
            activeTab === "all"
              ? "border-teal-500 text-teal-600 dark:text-teal-400 font-bold"
              : "border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
          }`}
        >
          All Apps
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("installed")}
          className={`pb-3 transition-colors whitespace-nowrap border-b-2 ${
            activeTab === "installed"
              ? "border-teal-500 text-teal-600 dark:text-teal-400 font-bold"
              : "border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
          }`}
        >
          Installed Apps ({marketplaceItems.filter((i) => i.status === "installed").length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("ai_agents")}
          className={`pb-3 transition-colors whitespace-nowrap border-b-2 ${
            activeTab === "ai_agents"
              ? "border-teal-500 text-teal-600 dark:text-teal-400 font-bold"
              : "border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
          }`}
        >
          AI Agents
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("coming_soon")}
          className={`pb-3 transition-colors whitespace-nowrap border-b-2 ${
            activeTab === "coming_soon"
              ? "border-teal-500 text-teal-600 dark:text-teal-400 font-bold"
              : "border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
          }`}
        >
          Upcoming Pipelines
        </button>
      </div>

      {/* Sidebar + Main Grid Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start pt-2">
        {/* Left Filter Sidebar */}
        <div className="lg:col-span-3 space-y-6 text-xs text-zinc-600 dark:text-zinc-400">
          {/* Collections Accordion */}
          <div className="space-y-3 pb-4 border-b border-zinc-200 dark:border-zinc-800">
            <button
              type="button"
              onClick={() => toggleSection("collections")}
              className="flex items-center justify-between w-full font-bold text-zinc-900 dark:text-white uppercase tracking-wider text-[11px]"
            >
              <span>Collections</span>
              {openSections.collections ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>

            {openSections.collections && (
              <div className="space-y-2 pt-1">
                {[
                  { id: "all", label: "All Collections" },
                  { id: "Top Installed Apps", label: "Top Installed Apps" },
                  { id: "Newly Added Apps", label: "Newly Added Apps" },
                  { id: "AI Agents", label: "AI Agents" },
                  { id: "Top Free Apps", label: "Top Free Apps" },
                ].map((col) => (
                  <label
                    key={col.id}
                    className="flex items-center gap-2.5 cursor-pointer hover:text-zinc-900 dark:hover:text-white transition-colors"
                  >
                    <input
                      type="radio"
                      name="collection"
                      checked={selectedCollection === col.id}
                      onChange={() => setSelectedCollection(col.id)}
                      className="accent-teal-500 focus:ring-0"
                    />
                    <span>{col.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Categories Accordion */}
          <div className="space-y-3 pb-4 border-b border-zinc-200 dark:border-zinc-800">
            <button
              type="button"
              onClick={() => toggleSection("categories")}
              className="flex items-center justify-between w-full font-bold text-zinc-900 dark:text-white uppercase tracking-wider text-[11px]"
            >
              <span>Categories</span>
              {openSections.categories ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>

            {openSections.categories && (
              <div className="space-y-2 pt-1">
                {[
                  { id: "all", label: "All Categories" },
                  { id: "Revenue Execution", label: "Revenue Execution" },
                  { id: "Onboarding", label: "Onboarding" },
                  { id: "Sales Intelligence", label: "Sales Intelligence" },
                  { id: "Disputes & Compliance", label: "Disputes & Compliance" },
                ].map((cat) => (
                  <label
                    key={cat.id}
                    className="flex items-center gap-2.5 cursor-pointer hover:text-zinc-900 dark:hover:text-white transition-colors"
                  >
                    <input
                      type="radio"
                      name="category"
                      checked={selectedCategory === cat.id}
                      onChange={() => setSelectedCategory(cat.id)}
                      className="accent-teal-500 focus:ring-0"
                    />
                    <span>{cat.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Pricing Accordion */}
          <div className="space-y-3 pb-4 border-b border-zinc-200 dark:border-zinc-800">
            <button
              type="button"
              onClick={() => toggleSection("pricing")}
              className="flex items-center justify-between w-full font-bold text-zinc-900 dark:text-white uppercase tracking-wider text-[11px]"
            >
              <span>Pricing</span>
              {openSections.pricing ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>

            {openSections.pricing && (
              <div className="space-y-2 pt-1">
                <label className="flex items-center gap-2.5 cursor-pointer hover:text-zinc-900 dark:hover:text-white">
                  <input type="checkbox" defaultChecked className="accent-teal-500 rounded" />
                  <span>Included in Workspace</span>
                </label>
              </div>
            )}
          </div>
        </div>

        {/* Right Main Grid */}
        <div className="lg:col-span-9 space-y-6">
          {/* Main Content Header & Search */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <p className="text-sm font-bold text-zinc-900 dark:text-white font-mono">
              {filteredItems.length} {filteredItems.length === 1 ? "App" : "Apps & Agents"}
            </p>

            <div className="relative w-full sm:w-72">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Apps..."
                className="w-full pl-9 pr-4 py-2 rounded-xl text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:outline-none focus:border-teal-500 dark:focus:border-teal-400 text-zinc-900 dark:text-white placeholder-zinc-400 shadow-sm"
              />
            </div>
          </div>

          {/* Glassmorphic App Store Card Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {filteredItems.map((item) => {
              const ItemIcon = item.icon;

              return (
                <div
                  key={item.id}
                  onClick={() => item.href && router.push(item.href)}
                  className="group relative flex flex-col justify-between rounded-2xl border border-zinc-200/90 dark:border-zinc-800/80 bg-white/80 dark:bg-zinc-900/60 backdrop-blur-md p-5 transition-all duration-200 hover:bg-white dark:hover:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-md cursor-pointer"
                >
                  <div className="space-y-4">
                    {/* Top Header: Icon + Title + Developer + Downloads */}
                    <div className="flex items-start gap-3">
                      <div
                        className={`p-3 rounded-2xl border shrink-0 group-hover:scale-105 transition-transform ${item.iconBg}`}
                      >
                        <ItemIcon size={22} className={item.iconColor} />
                      </div>

                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-baseline justify-between gap-1">
                          <h3 className="text-sm font-bold text-zinc-900 dark:text-white truncate group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                            {item.name}
                          </h3>
                        </div>

                        <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-500">
                          <span className="truncate">By {item.developer}</span>
                          <span>•</span>
                          <span className="flex items-center gap-1 shrink-0">
                            <Download size={11} /> {item.downloads}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Description */}
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                      {item.description}
                    </p>

                    {/* Rating & Reviews */}
                    <div className="flex items-center gap-1.5 text-xs text-amber-500 font-semibold font-sans">
                      <div className="flex items-center">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            size={12}
                            className={
                              i < Math.floor(item.rating)
                                ? "fill-amber-500 text-amber-500"
                                : "text-zinc-300 dark:text-zinc-700"
                            }
                          />
                        ))}
                      </div>
                      <span className="text-[11px] font-bold text-zinc-900 dark:text-zinc-200">
                        {item.rating.toFixed(1)}
                      </span>
                      <span className="text-[11px] text-zinc-400 font-normal">({item.reviews})</span>
                    </div>
                  </div>

                  {/* Bottom Footer Action Badges */}
                  <div className="mt-5 pt-3.5 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
                      {item.category}
                    </span>

                    {/* Installed Pill: Theme-Adaptive Solid Fill */}
                    {item.status === "installed" ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 shadow-sm">
                        <CheckCircle2 size={12} className="text-emerald-400 dark:text-emerald-600" />
                        Installed
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700/60">
                        Coming Soon
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}