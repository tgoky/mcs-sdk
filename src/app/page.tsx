import { getSession } from "@/lib/session";
import { Button } from "@/components/ui/button";

export default async function LandingIndexPage() {
  const session = await getSession();

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-zinc-950 p-6 min-h-screen">
      <main className="w-full max-w-xl border border-border rounded-2xl bg-background p-10 shadow-xl shadow-zinc-200/50 dark:shadow-none text-center space-y-6">
        <div className="inline-flex h-9 w-9 rounded-xl bg-primary items-center justify-center text-primary-foreground font-black text-sm">
          M
        </div>
        
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Mudd Ventures Unified Interface
          </h1>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            Stealth, server-isolated instrumentation panel for the Showtime Revenue Infrastructure Engine.
          </p>
        </div>

        <div className="pt-4 flex justify-center">
          {session.whopUserId ? (
            <a href="/dashboard" className="w-full sm:w-auto">
              <Button className="w-full sm:w-48">Go to Telemetry Hub</Button>
            </a>
          ) : (
            <a href="/api/auth/login" className="w-full sm:w-auto">
              <Button className="w-full sm:w-48 font-semibold">Authenticate via Whop</Button>
            </a>
          )}
        </div>
      </main>
    </div>
  );
}