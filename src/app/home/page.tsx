import { getSession } from "@/lib/session";
import Link from "next/link";
import { LayoutGrid, Gavel, Plus } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { HOME_COPY, WORKSPACE_PRODUCTS } from "@/lib/copy";
import { listWorkspaces, getInstalledPackagesByWorkspace, type Workspace } from "@/lib/workspace";

// Rendered fresh on every request — session-scoped, never statically cached.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const PACKAGE_NAMES = new Map(WORKSPACE_PRODUCTS.map((p) => [p.id, p.name] as const));

/** Same squishy circular badge used across the app for a workspace's
 * installed packages — Showtime's teal grid, Counter Claim's amber gavel. */
function PackageBadge({ packageId }: { packageId: string }) {
  if (packageId === "counter-claim") {
    return (
      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-400 dark:bg-amber-500 select-none">
        <Gavel size={11} className="text-zinc-950 stroke-[2.5px] fill-white" strokeLinecap="round" strokeLinejoin="round" />
      </div>
    );
  }
  return (
    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-500 dark:bg-teal-400 select-none">
      <LayoutGrid size={11} className="text-zinc-950 stroke-[2.5px] fill-white" strokeLinecap="round" strokeLinejoin="round" />
    </div>
  );
}

function WorkspaceCard({ workspace, packageIds }: { workspace: Workspace; packageIds: string[] }) {
  return (
    <form action={`/api/workspaces/${workspace.workspaceId}/switch`} method="POST" className="h-full">
      <button
        type="submit"
        className="group flex h-full w-full flex-col justify-between rounded-2xl border border-zinc-200/90 bg-white/80 p-6 text-left transition-all duration-200 select-none hover:-translate-y-1 hover:border-zinc-300 hover:shadow-md dark:border-zinc-800/90 dark:bg-zinc-900/60 dark:hover:border-zinc-700 dark:hover:bg-zinc-900/80 backdrop-blur-xs cursor-pointer"
      >
        <div className="space-y-4">
          <div className="flex items-center gap-1.5">
            {packageIds.length > 0 ? (
              packageIds.map((id) => <PackageBadge key={id} packageId={id} />)
            ) : (
              <span className="font-mono text-[10px] font-medium text-zinc-400 dark:text-zinc-600">
                Nothing installed
              </span>
            )}
          </div>

          <div className="space-y-1.5">
            <h2 className="text-base font-bold tracking-tight text-zinc-900 dark:text-zinc-100 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
              {workspace.name}
            </h2>
            <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400 font-sans">
              {packageIds.length > 0
                ? packageIds.map((id) => PACKAGE_NAMES.get(id) ?? id).join(" · ")
                : "No packages installed yet"}
            </p>
          </div>
        </div>

        <div className="pt-6">
          <span className="inline-flex w-full items-center justify-center rounded-lg bg-zinc-900 px-2.5 py-1.5 text-xs font-bold text-white shadow-xs transition-all group-hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:group-hover:bg-zinc-200">
            {HOME_COPY.openLabel} {workspace.name}
          </span>
        </div>
      </button>
    </form>
  );
}

function CreateWorkspaceCard() {
  return (
    <Link
      href="/home/new"
      prefetch={false}
      className="flex h-full flex-col items-center justify-center gap-2.5 rounded-2xl border border-dashed border-zinc-300 bg-transparent p-6 text-center transition-all duration-200 hover:-translate-y-1 hover:border-zinc-400 hover:bg-white/60 dark:border-zinc-700 dark:hover:border-zinc-600 dark:hover:bg-zinc-900/40 min-h-[176px]"
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-300 text-zinc-400 dark:border-zinc-700 dark:text-zinc-500">
        <Plus size={16} />
      </div>
      <span className="text-sm font-bold text-zinc-600 dark:text-zinc-400">Create workspace</span>
    </Link>
  );
}

export default async function WorkspaceHomePage() {
  const session = await getSession();
  const whopUserId = session.whopUserId!;
  const displayName = session.email?.split("@")[0] ?? "there";
  const initials = displayName.slice(0, 2).toUpperCase();

  const workspaceList = await listWorkspaces(whopUserId);
  const installedByWorkspace = await getInstalledPackagesByWorkspace(
    workspaceList.map((w) => w.workspaceId)
  );

  return (
    <div className="relative min-h-screen bg-zinc-50/50 font-sans text-zinc-600 antialiased dark:bg-zinc-950 dark:text-zinc-400 transition-colors duration-200 overflow-hidden">
      
      {/* --- HIGH-DENSITY TIGHT MICRO DOT GRID OVERLAY --- */}
      <div 
        className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(#cbd5e1_0.8px,transparent_0.8px)] dark:bg-[radial-gradient(#27272a_0.8px,transparent_0.8px)] [background-size:10px_10px] [mask-image:radial-gradient(ellipse_75%_75%_at_50%_30%,#000_60%,transparent_100%)] opacity-80" 
        aria-hidden="true"
      />

      {/* --- MAIN PAGE CONTENT --- */}
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-8 sm:px-10 lg:px-12">

        {/* Asana Header Bar */}
        <header className="flex items-center justify-between gap-4 border-b border-zinc-200/80 pb-5 dark:border-zinc-800/80">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-600 dark:bg-teal-500 text-xs font-bold text-white font-mono shadow-2xs">
              {initials}
            </div>
            <div className="space-y-0.5">
              <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                {HOME_COPY.eyebrow}
              </p>
              <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
                Welcome back, {displayName}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link
              href="/api/auth/logout"
              prefetch={false}
              className="font-mono text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200 px-2 py-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-900"
            >
              {HOME_COPY.signOut}
            </Link>
          </div>
        </header>

        {/* Workspaces Grid */}
        <main className="flex-1 py-10">
          <div className="mb-8 space-y-1">
            <div className="flex items-center gap-1.5">
              <h1 className="font-mono text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                Your workspaces
              </h1>
            </div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 font-medium">
              Each workspace has its own clients and installed packages. Enter one, or create a new one.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {workspaceList.map((workspace) => (
              <WorkspaceCard
                key={workspace.workspaceId}
                workspace={workspace}
                packageIds={installedByWorkspace.get(workspace.workspaceId) ?? []}
              />
            ))}
            <CreateWorkspaceCard />
          </div>
        </main>

        {/* Footer */}
        <footer className="border-t border-zinc-200/80 pt-6 dark:border-zinc-800/80">
          <p className="font-mono text-xs text-zinc-400 dark:text-zinc-600">
            {HOME_COPY.footerNote}
          </p>
        </footer>
      </div>
    </div>
  );
}
