import { getSession } from "@/lib/session";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { HOME_COPY } from "@/lib/copy";
import { listWorkspaces, getInstalledPackagesByWorkspace } from "@/lib/workspace";
import { WorkspaceHomeClient } from "./workspace-home-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function WorkspaceHomePage() {
  const session = await getSession();
  const whopUserId = session.whopUserId!;
  const displayName = session.email?.split("@")[0] ?? "there";
  const initials = displayName.slice(0, 2).toUpperCase();
  const workspaceList = await listWorkspaces(whopUserId);
  const installedMap = await getInstalledPackagesByWorkspace(
    workspaceList.map((w) => w.workspaceId)
  );
  const installedByWorkspace: Record<string, string[]> = {};
  installedMap.forEach((packages, wsId) => {
    installedByWorkspace[wsId] = packages;
  });

  return (
    <div className="relative min-h-screen w-full bg-cover bg-center bg-no-repeat bg-fixed bg-[url('/images/forwhite.jpeg')] dark:bg-[url('/images/forblack.jpeg')] font-sans text-zinc-600 antialiased dark:text-zinc-400 transition-colors duration-200 flex items-center justify-center p-4 sm:p-6 lg:p-10">
      <div className="relative z-10 w-full max-w-6xl rounded-xl border border-zinc-200/80 bg-white/95 dark:bg-zinc-950/95 p-6 sm:p-8 lg:p-10 shadow-2xl backdrop-blur-md dark:border-zinc-800/80 flex flex-col justify-between min-h-[80vh]">
        <div className="space-y-6">
          <header className="flex items-center justify-between gap-4 border-b border-zinc-200/80 pb-5 dark:border-zinc-800/80">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-900 dark:bg-zinc-100 text-xs font-bold text-white dark:text-zinc-950 font-mono shadow-2xs">
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

          <WorkspaceHomeClient
            workspaceList={workspaceList}
            installedByWorkspace={installedByWorkspace}
          />
        </div>

        <footer className="border-t border-zinc-200/80 pt-6 dark:border-zinc-800/80 mt-8">
          <p className="font-mono text-xs text-zinc-400 dark:text-zinc-600">
            {HOME_COPY.footerNote}
          </p>
        </footer>
      </div>
    </div>
  );
}