import { getSession } from "@/lib/session";
import { Button } from "@/components/ui/button";

export default async function LandingIndexPage() {
  const session = await getSession();

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-zinc-950 p-6 min-h-screen">
      <main className="w-full max-w-xl border border-zinc-200 rounded-2xl bg-white dark:border-zinc-900 dark:bg-zinc-950 p-10 shadow-sm text-center space-y-6 select-none tracking-tight">
        
        {/* Clean, Non-Intimidating Core Logo Mark */}
        {/* <div className="inline-flex h-10 w-10 rounded-xl bg-zinc-900 dark:bg-zinc-100 items-center justify-center text-white dark:text-zinc-950 font-sans text-base font-bold shadow-sm">
          S
        </div>
         */}
        {/* Plain English Value Copy */}
        <div className="space-y-2">
          <h1 className="text-xl font-medium tracking-tight text-zinc-900 dark:text-zinc-100 sm:text-2xl">
            Showtime Control Panel
          </h1>
          <p className="text-sm font-normal text-zinc-500 max-w-sm mx-auto leading-relaxed">
            Automate your client onboarding configuration, automated follow-ups, and sales team briefing logs from a single workspace.
          </p>
        </div>

        {/* Unchanged Structural Auth Gates & Routing Mechanics */}
        <div className="pt-2 flex justify-center w-full">
          {session.whopUserId ? (
            <a href="/dashboard" className="w-full sm:w-auto">
              <Button variant="outline" className="w-full sm:w-48 text-xs font-mono uppercase tracking-wider cursor-pointer">
                [ Go to Dashboard ]
              </Button>
            </a>
          ) : (
            <a href="/api/auth/login" className="w-full sm:w-auto">
              <Button className="w-full sm:w-48 text-xs font-sans font-medium bg-zinc-100 text-zinc-950 rounded-lg hover:bg-zinc-200 transition-colors cursor-pointer">
                Sign in with Whop
              </Button>
            </a>
          )}
        </div>
      </main>
    </div>
  );
}