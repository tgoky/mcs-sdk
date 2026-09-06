import { Home, Building2, FileText } from "lucide-react";
import { SidebarNavLinks, type NavLinkItem } from "../sidebar-nav-links";
import { ReportsClientLinks } from "./reports-client-links";
import { listReportableClients } from "./reports-sidebar";
import type { ProductId } from "@/lib/product-catalog";

/**
 * The secondary sidebar content shown specifically for /dashboard/reports
 * — one instance per product (rendered once for each in dashboard/layout.tsx,
 * secondary-sidebar.tsx picks the right one via the `?product=` param).
 *
 * Deliberately NOT the full ReputationManagerSidebar/ShowtimeSidebar (which
 * also carries Queue, Executions, and the Capabilities skill grid) — this
 * used to reuse that whole component, the same way Queue/Executions do,
 * which meant clicking Reports left Queue/Executions/Capabilities sitting
 * in the sidebar for no reason. Reports gets its own trimmed nav (Home/
 * Clients/Reports only) with the actual client picker directly underneath
 * it, in the sidebar, where the other product sections' own Clients link
 * would otherwise just be a dead end for "which client's report am I
 * looking at."
 */
export async function ReportsSidebarSection({
  whopUserId,
  workspaceId,
  product,
}: {
  whopUserId: string;
  workspaceId: string;
  product: ProductId;
}) {
  const clients = await listReportableClients(whopUserId, workspaceId, product);

  const nav: NavLinkItem[] = [
    {
      href: product === "showtime" ? "/dashboard/showtime" : "/dashboard/reputation-manager",
      label: "Home",
      icon: <Home className="w-4 h-4" />,
    },
    { href: `/dashboard/engagements?product=${product}`, label: "Clients", icon: <Building2 className="w-4 h-4" /> },
    { href: `/dashboard/reports?product=${product}`, label: "Reports", icon: <FileText className="w-4 h-4" /> },
  ];

  return (
    <div className="flex flex-col gap-3">
      <SidebarNavLinks links={nav} />
      <div className="h-px bg-zinc-200/80 dark:bg-zinc-800/80 mx-1" />
      {clients.length === 0 ? (
        <p className="px-2.5 text-xs text-zinc-500 dark:text-zinc-400">No clients yet.</p>
      ) : (
        <>
          {/* Distinct from the "Clients" nav link above (which goes to the
              full roster) — this labels the picker underneath it, so it
              reads as "reports, one per client" rather than a second,
              redundant Clients link. */}
          <div className="px-2.5 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 font-mono tracking-wider uppercase">
            Client Reports
          </div>
          <ReportsClientLinks clients={clients} product={product} />
        </>
      )}
    </div>
  );
}

/** Static skeleton fallback for Suspense boundary */
export function ReportsSidebarSectionSkeleton() {
  return (
    <div className="flex flex-col gap-1 animate-pulse">
      {["Home", "Clients", "Reports"].map((label) => (
        <div key={label} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium">
          <div className="w-4 h-4 rounded bg-zinc-200 dark:bg-zinc-800 shrink-0" />
          <span className="text-zinc-400 dark:text-zinc-600">{label}</span>
        </div>
      ))}
    </div>
  );
}
