"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import type { PackageOverview } from "@/lib/package-overview";
import { PackageHeroCard } from "@/components/library/package-hero-card";
import { PackageTeaserCard } from "@/components/library/package-teaser-card";
import { Search, ChevronDown, ChevronRight, ChevronLeft } from "lucide-react";

export function LibraryMarketplaceClient({ overview }: { overview: PackageOverview }) {
  const [activeTab, setActiveTab] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCollection, setSelectedCollection] = useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedExecutionMode, setSelectedExecutionMode] = useState<string>("all");

  const [openSections, setOpenSections] = useState({
    collections: true,
    categories: true,
    executionMode: true,
  });

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const packages = useMemo(
    () => [
      {
        id: "showtime",
        name: "Showtime",
        category: "Revenue Execution",
        collection: "Top Installed Workers",
        executionMode: "Hybrid Webhook & Cron",
        status: "installed" as const,
      },
      {
        id: "counter-claim",
        name: "Counter Claim",
        category: "Disputes & Compliance",
        collection: "Newly Added Apps",
        executionMode: "Dispute Event Listener",
        status: "coming_soon" as const,
      },
    ],
    []
  );

  const filteredPackages = useMemo(() => {
    return packages.filter((pkg) => {
      if (activeTab === "installed" && pkg.status !== "installed") return false;
      if (activeTab === "coming_soon" && pkg.status !== "coming_soon") return false;

      if (selectedCollection !== "all" && pkg.collection !== selectedCollection) return false;
      if (selectedCategory !== "all" && pkg.category !== selectedCategory) return false;
      if (selectedExecutionMode !== "all" && pkg.executionMode !== selectedExecutionMode) return false;

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        return pkg.name.toLowerCase().includes(query);
      }

      return true;
    });
  }, [packages, activeTab, selectedCollection, selectedCategory, selectedExecutionMode, searchQuery]);

  return (
    <div className="relative min-h-screen w-full font-sans transition-colors duration-200 overflow-hidden pb-10">
      {/* --- HYPER-MICRO TIGHT DOT GRID (0.5px / 6px grid) --- */}
      <div
        className="pointer-events-none absolute inset-0 z-0 bg-dot-grid"
        aria-hidden="true"
      />

      {/* --- MARKETPLACE CONTENT --- */}
      <div className="relative z-10 w-full space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <Link
              href="/dashboard"
              className="flex items-center justify-center w-8 h-8 rounded-full border border-border bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 transition-colors shrink-0 mt-0.5"
              aria-label="Back to Dashboard"
            >
              <ChevronLeft className="w-4 h-4" />
            </Link>
            <div className="min-w-0 space-y-1.5">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
                  Marketplace Apps
                </h1>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5 font-medium">
                  Explore automation workers and integrate them into your client workspace.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400 -mt-1">
                <span className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-900 border border-border text-zinc-800 dark:text-zinc-200 font-mono text-[11px] font-semibold">
                  {packages.length} workers
                </span>
                <span className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-900 border border-border text-zinc-800 dark:text-zinc-200 font-mono text-[11px] font-semibold">
                  {packages.filter((p) => p.status === "installed").length} installed
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-6 border-b border-border overflow-x-auto scrollbar-none text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab("all")}
            className={`pb-3 transition-colors whitespace-nowrap border-b-2 cursor-pointer ${
              activeTab === "all"
                ? "border-amber-400 text-amber-600 dark:text-amber-400 font-bold"
                : "border-transparent text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            All Workers ({packages.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("installed")}
            className={`pb-3 transition-colors whitespace-nowrap border-b-2 cursor-pointer ${
              activeTab === "installed"
                ? "border-amber-400 text-amber-600 dark:text-amber-400 font-bold"
                : "border-transparent text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            Installed Workers ({packages.filter((p) => p.status === "installed").length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("coming_soon")}
            className={`pb-3 transition-colors whitespace-nowrap border-b-2 cursor-pointer ${
              activeTab === "coming_soon"
                ? "border-amber-400 text-amber-600 dark:text-amber-400 font-bold"
                : "border-transparent text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            Upcoming ({packages.filter((p) => p.status === "coming_soon").length})
          </button>
        </div>

        {/* Layout Split */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start pt-2">
          {/* Sidebar Filters */}
          <div className="lg:col-span-3 space-y-6 text-xs text-zinc-700 dark:text-zinc-400">
            {/* Section 1: Collections */}
            <div className="space-y-3 pb-4 border-b border-border">
              <button
                type="button"
                onClick={() => toggleSection("collections")}
                className="flex items-center justify-between w-full font-bold text-zinc-900 dark:text-white uppercase tracking-wider text-[11px] cursor-pointer"
              >
                <span>Collections</span>
                {openSections.collections ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>

              {openSections.collections && (
                <div className="space-y-2 pt-1">
                  {[
                    { id: "all", label: "All Collections" },
                    { id: "Top Installed Workers", label: "Top Installed Workers" },
                    { id: "Newly Added Workers", label: "Newly Added Workers" },
                  ].map((col) => (
                    <label
                      key={col.id}
                      className="flex items-center gap-2.5 cursor-pointer text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors"
                    >
                      <input
                        type="radio"
                        name="collection"
                        checked={selectedCollection === col.id}
                        onChange={() => setSelectedCollection(col.id)}
                        className="accent-amber-400 focus:ring-0 cursor-pointer"
                      />
                      <span>{col.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Section 2: Categories */}
            <div className="space-y-3 pb-4 border-b border-border">
              <button
                type="button"
                onClick={() => toggleSection("categories")}
                className="flex items-center justify-between w-full font-bold text-zinc-900 dark:text-white uppercase tracking-wider text-[11px] cursor-pointer"
              >
                <span>Categories</span>
                {openSections.categories ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>

              {openSections.categories && (
                <div className="space-y-2 pt-1">
                  {[
                    { id: "all", label: "All Categories" },
                    { id: "Revenue Execution", label: "Revenue Execution" },
                    { id: "Disputes & Compliance", label: "Disputes & Compliance" },
                  ].map((cat) => (
                    <label
                      key={cat.id}
                      className="flex items-center gap-2.5 cursor-pointer text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors"
                    >
                      <input
                        type="radio"
                        name="category"
                        checked={selectedCategory === cat.id}
                        onChange={() => setSelectedCategory(cat.id)}
                        className="accent-amber-400 focus:ring-0 cursor-pointer"
                      />
                      <span>{cat.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Section 3: Execution Mode */}
            <div className="space-y-3 pb-4 border-b border-border">
              <button
                type="button"
                onClick={() => toggleSection("executionMode")}
                className="flex items-center justify-between w-full font-bold text-zinc-900 dark:text-white uppercase tracking-wider text-[11px] cursor-pointer"
              >
                <span>Execution Mode</span>
                {openSections.executionMode ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>

              {openSections.executionMode && (
                <div className="space-y-2 pt-1">
                  {[
                    { id: "all", label: "All Execution Modes" },
                    { id: "Hybrid Webhook & Cron", label: "Hybrid Webhook & Cron" },
                    { id: "Dispute Event Listener", label: "Dispute Event Listener" },
                  ].map((mode) => (
                    <label
                      key={mode.id}
                      className="flex items-center gap-2.5 cursor-pointer text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors"
                    >
                      <input
                        type="radio"
                        name="executionMode"
                        checked={selectedExecutionMode === mode.id}
                        onChange={() => setSelectedExecutionMode(mode.id)}
                        className="accent-amber-400 focus:ring-0 cursor-pointer"
                      />
                      <span>{mode.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Main Grid Render */}
          <div className="lg:col-span-9 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <p className="text-sm font-bold text-zinc-900 dark:text-white font-mono">
                {filteredPackages.length} {filteredPackages.length === 1 ? "Worker" : "Workers"} Available
              </p>

              <div className="relative w-full sm:w-72">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 dark:text-zinc-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search Workers..."
                  className="w-full pl-9 pr-4 py-2 rounded-xl text-xs bg-white dark:bg-zinc-900 border border-border focus:outline-none focus:border-amber-400 text-zinc-900 dark:text-white placeholder-zinc-500 dark:placeholder-zinc-400 shadow-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
              {filteredPackages.some((p) => p.id === "showtime") && (
                <PackageHeroCard overview={overview} />
              )}
              {filteredPackages.some((p) => p.id === "counter-claim") && (
                <PackageTeaserCard />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}