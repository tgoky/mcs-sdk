import { getSession } from "@/lib/session";
import { Button } from "@/components/ui/button";

const ACTIVE_STATUSES = new Set(["active", "trialing", "canceling", "admin"]);

export default async function LandingIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ membership?: string }>;
}) {
  const session = await getSession();
  const { membership } = await searchParams;
  const hasAccess = ACTIVE_STATUSES.has(session.subscriptionStatus ?? "");
  const membershipRequired = membership === "required";

  return (
    <div className="relative min-h-screen bg-zinc-950 text-zinc-50 font-sans overflow-hidden selection:bg-zinc-800">
      
      {/* Self-Contained High-Grade Telemetry CSS Keyframes */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes laserSweep {
          0% { top: 0%; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
        @keyframes variableFlicker {
          0%, 100% { opacity: 1; filter: brightness(1); }
          45% { opacity: 1; }
          46% { opacity: 0.75; filter: brightness(0.8); }
          47% { opacity: 0.9; }
          48% { opacity: 1; }
          82% { opacity: 1; }
          83% { opacity: 0.85; }
          84% { opacity: 1; }
        }
      `}} />

      {/* ---------------------------------------------------------------------- */}
      {/* LAYER 1: BASE STRUCTURAL GRID MESH (Ultramarkets Style) */}
      {/* ---------------------------------------------------------------------- */}
      <div className="absolute inset-0 grid grid-cols-6 md:grid-cols-12 grid-rows-6 pointer-events-none opacity-20 z-0">
        {Array.from({ length: 72 }).map((_, i) => (
          <div key={i} className="border-[0.5px] border-zinc-800 last:border-r-0" />
        ))}
      </div>

      {/* ---------------------------------------------------------------------- */}
      {/* LAYER 2: HIGH-RES BACKDROP ASSETS (Rectangles.fm Style Collage) */}
      {/* ---------------------------------------------------------------------- */}
      
      {/* Asset 1: Large Manila Folder Backdrop Texture */}
      <div className="absolute top-[10%] right-[-10%] md:right-[5%] w-[800px] h-[600px] pointer-events-none opacity-30 mix-blend-lighten z-0 hidden lg:block">
        <img 
          src="/images/manila-folder-texture.webp" 
          alt="" 
          className="w-full h-full object-contain"
        />
      </div>

      {/* Asset 2: Grid-Clipped Portrait 1 */}
      <div className="absolute top-24 left-12 w-20 h-20 border border-zinc-800 hidden xl:block z-10 grayscale hover:grayscale-0 transition-all">
        <img 
          src="/images/operator-portrait-1w.webp" 
          alt="System Operator" 
          className="w-full h-full object-cover"
        />
      </div>

      {/* Asset 3: Grid-Clipped Portrait 2 */}
      <div className="absolute bottom-24 right-24 w-24 h-24 border border-zinc-800 hidden xl:block z-10 grayscale hover:grayscale-0 transition-all">
        <img 
          src="/images/operator-portrait-2.webp" 
          alt="System Operator" 
          className="w-full h-full object-cover"
        />
      </div>

      {/* ---------------------------------------------------------------------- */}
      {/* LAYER 3: THE FOREGROUND INTERFACE */}
      {/* ---------------------------------------------------------------------- */}
      <div className="relative z-20 max-w-6xl mx-auto px-6 pt-24 pb-16 min-h-screen flex flex-col justify-between">
        
        {/* Top Header */}
        <header className="flex items-center justify-between w-full border-b border-zinc-900/80 pb-6">
          <div className="font-mono text-xs uppercase tracking-[0.25em] text-zinc-400">
            SHOWTIME // PANEL 1.34
          </div>
          {/* <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" /> */}
        </header>

        {/* Central Component Grid */}
        <main className="grid grid-cols-1 lg:grid-cols-12 gap-12 my-auto items-center pt-12 pb-12">
          
          {/* Left Text Column: Cleaned Narrative Copy + Advanced System Target Element */}
          <div className="lg:col-span-7 space-y-6 text-left select-text">
            <h1 className="text-4xl sm:text-6xl font-extrabold uppercase tracking-tight leading-[0.95] text-zinc-100 max-w-xl">
              Where Your <br />
              
              {/* THE SYSTEM VARIABLE: Hard-engineered alternative to typewriter effects */}
              <span className="relative inline-flex items-center px-4 py-1.5 font-mono lowercase tracking-normal bg-zinc-900/40 border border-zinc-800/80 text-zinc-400 text-3xl sm:text-5xl my-2 overflow-hidden group select-none">
                {/* Tech Bracket Corners */}
                <div className="absolute top-0 left-0 w-1.5 h-1.5 border-t border-l border-zinc-600" />
                <div className="absolute top-0 right-0 w-1.5 h-1.5 border-t border-r border-zinc-600" />
                <div className="absolute bottom-0 left-0 w-1.5 h-1.5 border-b border-l border-zinc-600" />
                <div className="absolute bottom-0 right-0 w-1.5 h-1.5 border-b border-r border-zinc-600" />
                
                {/* Active Laser Sweep Overlay */}
                <div className="absolute inset-x-0 h-[1.5px] bg-indigo-500/40 opacity-0 style animate-[laserSweep_2.5s_linear_infinite]" />
                
                {/* Muted Text Layer with Data Flicker */}
                <span className="relative z-10 animate-[variableFlicker_5s_infinite] bg-gradient-to-r from-zinc-200 via-zinc-400 to-zinc-100 bg-clip-text text-transparent">
                  infrastructure
                </span>
              </span>
              
              <br />Gets Automated.
            </h1>
            
            <div className="space-y-4 max-w-xl text-zinc-400 text-sm md:text-base leading-relaxed font-normal tracking-normal">
              <p>
                Stop losing high-ticket revenue to dropped calendar handoffs, fragmented lead tracking, and unverified client data. Showtime links directly into your existing pipelines to streamline backend logic from a single screen[cite: 2].
              </p>
              <p className="text-xs font-mono text-zinc-600 uppercase tracking-widest pt-2">
                System Capabilities: Core Onboarding Mesh[cite: 2] • Automated Follow-Ups[cite: 2] • Pre-Call AI Reads[cite: 2] • Funnel Leak Maps[cite: 2].
              </p>
            </div>
          </div>

          {/* Right Interface Card Box */}
          <div className="lg:col-span-5 w-full max-w-sm lg:ml-auto relative">
            
            {/* Asset 4: Torn Note Paper Scrap Shadow Overlay */}
            <div className="absolute -bottom-16 -left-12 w-48 h-32 pointer-events-none opacity-40 z-0 transform -rotate-6 hidden sm:block">
              <img 
                src="/images/torn-paper-note.png" 
                alt="" 
                className="w-full h-full object-contain"
              />
            </div>

            {/* The Login Card Grid Box */}
            <div className="relative border border-zinc-800 bg-zinc-900/70 backdrop-blur-md p-8 rounded-none shadow-[20px_20px_0px_0px_rgba(9,9,11,0.6)] space-y-6 z-10">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-4 font-mono text-[10px] tracking-widest text-zinc-500 uppercase">
                <span>SHOW TIME // AUTH_MODE</span>
                <span>[01]</span>
              </div>

              <div className="space-y-2">
                <label className="block font-mono text-xs uppercase tracking-wider text-zinc-400">
                  Dashboard Access
                </label>
                <p className="text-xs text-zinc-500 leading-normal">
                  Initialize pile-on, pin-downs, pre-call reads, win backs && leak-maps [cite: 2].
                </p>
              </div>

              {membershipRequired && (
                <div className="rounded border border-amber-500/20 bg-amber-500/5 p-3.5 text-left text-xs text-amber-400 font-mono space-y-1">
                  <div className="font-semibold uppercase tracking-wider text-amber-500">
                    ! ACCESS_DENIED
                  </div>
                  <p className="text-zinc-400 leading-normal">
                    {session.whopUserId
                      ? "Whop profile active, but missing a valid execution license. Verify token status[cite: 2]."
                      : "No authentication credentials found. Initialize network layer below[cite: 2]."}
                  </p>
                </div>
              )}

              <div className="pt-2">
                {session.whopUserId && hasAccess ? (
                  <a href="/dashboard" className="block w-full">
                    <Button className="w-full h-11 text-xs font-mono uppercase tracking-widest bg-zinc-100 text-zinc-950 rounded-none hover:bg-zinc-200 transition-all cursor-pointer">
                      [ Enter Workspace ]
                    </Button>
                  </a>
                ) : session.whopUserId ? (
                  <a
                    href={process.env.WHOP_COMPANY_CHECKOUT_URL ?? "https://whop.com"}
                    className="block w-full"
                  >
                    <Button className="w-full h-11 text-xs font-mono uppercase tracking-widest border border-zinc-800 bg-transparent text-zinc-200 rounded-none hover:bg-zinc-900 transition-colors cursor-pointer">
                      Acquire Access Key
                    </Button>
                  </a>
                ) : (
                  <a href="/api/auth/login" className="block w-full">
                    <Button className="w-full h-11 text-xs font-mono uppercase tracking-wider bg-zinc-100 text-zinc-950 rounded-none hover:bg-zinc-200 transition-colors cursor-pointer">
                      Authenticate with Whop
                    </Button>
                  </a>
                )}
              </div>
            </div>

            {/* Asset 5: Vintage Retro Monitor or Tech component clip */}
            <div className="absolute -top-20 -right-16 w-32 h-32 pointer-events-none opacity-20 z-0 hidden lg:block">
              <img 
                src="/images/torn-paper-note.png" 
                alt="" 
                className="w-full h-full object-contain"
              />
            </div>

          </div>
        </main>
        
        {/* Footer */}
        <footer className="w-full pt-12 flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-zinc-600 border-t border-zinc-900/60">
          <div>MUDD INFRASTRUCTURE v1.34</div>
          <div>STATUS // NOMINAL</div>
        </footer>
      </div>
    </div>
  );
}