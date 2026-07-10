import { getSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Link2, Lock, Globe } from "lucide-react"; // Import high-fidelity vector tokens

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
      
      {/* Self-Contained High-Grade Telemetry CSS Keyframes & Pure-CSS Interactive State Routing */}
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
        @keyframes logStreamScroll {
          0% { transform: translateY(0); }
          100% { transform: translateY(-50%); }
        }
        @keyframes dataFlowMove {
          to { stroke-dashoffset: -20; }
        }
        @keyframes nodePulseGlow {
          0%, 100% { transform: scale(1); opacity: 0.3; }
          50% { transform: scale(1.05); opacity: 0.6; }
        }

        /* Telemetry Panel Layout Architecture Rules */
        .viz-pindown, .viz-pileon, .viz-winback, .viz-leakmap, .viz-precall { display: none !important; }

        /* Pure CSS Native State Gating - Shifts tabs instantly on navigation item hover */
        body:has(a[href*="pin-down"]:hover) .default-login-content { display: none !important; }
        body:has(a[href*="pin-down"]:hover) .viz-pindown { display: flex !important; }

        body:has(a[href*="pile-on"]:hover) .default-login-content { display: none !important; }
        body:has(a[href*="pile-on"]:hover) .viz-pileon { display: flex !important; }

        body:has(a[href*="win-back"]:hover) .default-login-content { display: none !important; }
        body:has(a[href*="win-back"]:hover) .viz-winback { display: flex !important; }

        body:has(a[href*="leak-map"]:hover) .default-login-content { display: none !important; }
        body:has(a[href*="leak-map"]:hover) .viz-leakmap { display: flex !important; }

        body:has(a[href*="pre-call-reads"]:hover) .default-login-content { display: none !important; }
        body:has(a[href*="pre-call-reads"]:hover) .viz-precall { display: flex !important; }
      `}} />

      {/* ---------------------------------------------------------------------- */}
      {/* RECTANGLES-STYLE FLAT HORIZONTAL STRIP: Distributed Spacing Layout */}
      {/* ---------------------------------------------------------------------- */}
      <header className="relative z-30 w-full border-b border-zinc-900/80 px-8 py-5 hidden md:flex items-center justify-between bg-zinc-950/40 backdrop-blur-md font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-500">
        {/* Item 1: Branding Anchor */}
        <div className="font-bold text-zinc-400 tracking-[0.25em]">
          SHOWTIME // 1.34
        </div>
        
        {/* Items 2-6: Individual Flat direct-sibling links with massive spacing between each */}
        <a href="/dashboard?skill=pin-down" className="hover:text-zinc-200 transition-colors">[ pin down ]</a>
        <a href="/dashboard?skill=pile-on" className="hover:text-zinc-200 transition-colors">[ pile on ]</a>
        <a href="/dashboard?skill=win-back" className="hover:text-zinc-200 transition-colors">[ win back ]</a>
        <a href="/dashboard?skill=leak-map" className="hover:text-zinc-200 transition-colors">[ leak map ]</a>
        <a href="/dashboard?skill=pre-call-reads" className="hover:text-zinc-200 transition-colors">[ pre-call reads ]</a>
        
        {/* Item 7: System Status Balance Anchor */}
        <div className="text-zinc-600 tracking-widest">
          STATUS // OK
        </div>
      </header>

      {/* Mobile-only fallback wrap to maintain layout structural sanity on small viewports */}
      <nav className="md:hidden relative z-30 w-full flex flex-wrap justify-center gap-x-4 gap-y-2 border-b border-zinc-900/40 px-6 py-4 text-[10px] font-mono uppercase tracking-widest text-zinc-500 bg-zinc-950/20">
        <a href="/dashboard?skill=pin-down">[ pin down ]</a>
        <a href="/dashboard?skill=pile-on">[ pile on ]</a>
        <a href="/dashboard?skill=win-back">[ win back ]</a>
        <a href="/dashboard?skill=leak-map">[ leak map ]</a>
        <a href="/dashboard?skill=pre-call-reads">[ pre-call reads ]</a>
      </nav>

      {/* ---------------------------------------------------------------------- */}
      {/* LAYER 1: BASE STRUCTURAL GRID MESH (Ultramarkets Style) */}
      {/* ---------------------------------------------------------------------- */}
      <div className="absolute inset-0 grid grid-cols-6 md:grid-cols-12 grid-rows-6 pointer-events-none opacity-20 z-0">
        {Array.from({ length: 72 }).map((_, i) => (
          <div key={i} className="border-[0.5px] border-zinc-800 last:border-r-0" />
        ))}
      </div>

      {/* ---------------------------------------------------------------------- */}
      {/* LAYER 2: HIGH-RES BACKDROP ASSETS */}
      {/* ---------------------------------------------------------------------- */}
      
      {/* Asset 1: Large Manila Folder Backdrop Texture */}
      <div className="absolute top-[15%] right-[-10%] md:right-[5%] w-[800px] h-[600px] pointer-events-none opacity-30 mix-blend-lighten z-0 hidden lg:block">
        <img 
          src="/images/manila-folder-texture.webp" 
          alt="" 
          className="w-full h-full object-contain"
        />
      </div>

      {/* Asset 2: Grid-Clipped Portrait 1 */}
      <div className="absolute top-36 left-12 w-20 h-20 border border-zinc-800 hidden xl:block z-10 grayscale hover:grayscale-0 transition-all">
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
      {/* LAYER 3: CORE CONTENT BODY VIEWPORT */}
      {/* ---------------------------------------------------------------------- */}
      <div className="relative z-20 max-w-6xl mx-auto px-6 flex flex-col justify-between min-h-[calc(100vh-62px)]">
        
        {/* Central Layout Column Block Assembly */}
        <main className="grid grid-cols-1 lg:grid-cols-12 gap-12 my-auto items-center pt-16 pb-12 w-full">
          
          {/* Left Text Column */}
          <div className="lg:col-span-7 space-y-6 text-left select-text">
            <h1 className="text-4xl sm:text-6xl font-extrabold uppercase tracking-tight leading-[0.95] text-zinc-100 max-w-xl">
              Where Your <br />
              
              {/* THE SYSTEM VARIABLE */}
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
                Stop losing high-ticket revenue to dropped calendar handoffs, fragmented lead tracking, and unverified client data. Showtime links directly into your existing pipelines to streamline backend logic from a single screen.
              </p>
              <p className="text-xs font-mono text-zinc-600 uppercase tracking-widest pt-2">
                System Capabilities: Core Onboarding Mesh • Automated Follow-Ups • Pre-Call AI Reads • Funnel Leak Maps.
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

            {/* The Login Card Grid Box Container */}
            <div className="relative border border-zinc-800 bg-zinc-900/70 backdrop-blur-md p-8 rounded-none shadow-[20px_20px_0px_0px_rgba(9,9,11,0.6)] min-h-[352px] flex flex-col justify-between z-10">
              
              {/* ────────────────────────────────────────────────────────────────────── */}
              {/* SKILL HOVER INTERACTIVE SUITE: Pure CSS Telemetry Graphics Mapping */}
              {/* ────────────────────────────────────────────────────────────────────── */}

              {/* View 1: [ pin down ] */}
              <div className="viz-pindown flex-1 flex flex-col justify-between h-full font-mono text-[9px]">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5 text-zinc-400 select-none">
                  <span className="flex items-center gap-1.5 uppercase font-bold">LIVE_TELEMETRY // PIN_DOWN</span>
                  <span>[ACTIVE]</span>
                </div>
                {/* Clean, monochrome schematic architecture with high-fidelity Lucide elements */}
                <div className="my-3.5 h-32 border border-zinc-800 bg-zinc-950/40 flex items-center justify-around px-4 text-zinc-400 text-center select-none">
                  <div className="flex flex-col items-center">
                    <div className="p-2.5 border border-zinc-800 bg-zinc-900/60 text-zinc-400 mb-1 rounded-sm">
                      <Link2 size={14} />
                    </div>
                    <span className="text-[8px] tracking-wider text-zinc-500">SCHEDULER LINK</span>
                  </div>
                  
                  <svg className="w-10 h-4 shrink-0 opacity-40" fill="none" viewBox="0 0 40 16">
                    <path d="M 0 8 H 40" stroke="#3f3f46" strokeWidth="1" strokeDasharray="3 3" style={{ animation: "dataFlowMove 1s linear infinite" }} />
                  </svg>
                  
                  <div className="flex flex-col items-center">
                    <div className="p-2.5 border border-zinc-800 bg-zinc-900/60 text-zinc-400 mb-1 rounded-sm shadow-sm">
                      <Lock size={14} />
                    </div>
                    <span className="text-[8px] tracking-wider text-zinc-500">ENCRYPTION CORE</span>
                  </div>
                  
                  <svg className="w-10 h-4 shrink-0 opacity-40" fill="none" viewBox="0 0 40 16">
                    <path d="M 0 8 H 40" stroke="#3f3f46" strokeWidth="1" strokeDasharray="3 3" style={{ animation: "dataFlowMove 1s linear infinite" }} />
                  </svg>
                  
                  <div className="flex flex-col items-center">
                    <div className="p-2.5 border border-zinc-800 bg-zinc-900/60 text-zinc-400 mb-1 rounded-sm">
                      <Globe size={14} />
                    </div>
                    <span className="text-[8px] tracking-wider text-zinc-500">CONFIRMATION PAGE</span>
                  </div>
                </div>
                <div className="p-3 bg-zinc-950 border border-zinc-900 text-zinc-400 h-[56px] overflow-hidden relative rounded-sm leading-normal select-text">
                  <div className="space-y-1 animate-[logStreamScroll_7s_infinite_linear]">
                    <div>&gt; SYSTEM // INITIALIZING PIN_DOWN ONBOARDING RUN</div>
                    <div>&gt; RESOLVING CANONICAL RESOURCE PROVIDER CONTEXT ENDPOINT</div>
                    <div>&gt; CREATING ENCRYPTED CONFIGURATION DATA RECORD LOCKS</div>
                    <div>&gt; CRYPTO // ADVANCED SYMMETRIC SEED COMPILATION FINALIZED</div>
                    <div>&gt; ASSEMBLY // INLINE STATIC SCHEMATIC PREPARED FOR ROUTER DEPLOY</div>
                    <div>&gt; WEBHOOK // HOOKING INBOUND DISPATCH ID FOR TARGET EVENT MESH</div>
                    <div>&gt; SYSTEM // INITIALIZING PIN_DOWN ONBOARDING RUN</div>
                    <div>&gt; RESOLVING CANONICAL RESOURCE PROVIDER CONTEXT ENDPOINT</div>
                  </div>
                </div>
              </div>

              {/* View 2: [ pile on ] */}
              <div className="viz-pileon flex-1 flex flex-col justify-between h-full font-mono text-[9px]">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5 text-zinc-400 select-none">
                  <span className="flex items-center gap-1.5 uppercase font-bold">LIVE_TELEMETRY // PILE_ON</span>
                  <span>[ACTIVE]</span>
                </div>
                <div className="my-3.5 h-32 border border-zinc-800 bg-zinc-950/40 flex flex-col justify-center px-6 space-y-2.5 text-zinc-500 select-none">
                  <div className="space-y-1">
                    <div className="flex justify-between text-[8px]"><span>INBOUND_BOOKING_ALERT</span><span className="text-emerald-400">100%</span></div>
                    <div className="h-1 w-full bg-zinc-900 border border-zinc-900/60"><div className="h-full bg-emerald-500" style={{ width: "100%" }} /></div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[8px]"><span>MESSAGE_PERSONALIZATION</span><span className="text-indigo-400 animate-pulse">75%</span></div>
                    <div className="h-1 w-full bg-zinc-900 border border-zinc-900/60"><div className="h-full bg-indigo-500 animate-pulse" style={{ width: "75%" }} /></div>
                  </div>
                </div>
                <div className="p-3 bg-zinc-950 border border-zinc-900 text-zinc-400 h-[56px] overflow-hidden relative rounded-sm leading-normal select-text">
                  <div className="space-y-1 animate-[logStreamScroll_7s_infinite_linear]">
                    <div>&gt; TRIGGER // NEW BOOKING DETECTED IN WORKSPACE</div>
                    <div>&gt; DATA // PROCESSING LEAD CONTEXT PROFILE FIELDS</div>
                    <div>&gt; MARKETING // QUEUING FOLLOW-UP CONTACT PROFILE</div>
                    <div>&gt; TEXT_ENGINE // PERSONALIZING SEQUENCE MESSAGE COPY</div>
                    <div>&gt; AUTOMATION // SHORT CUSTOM BRIEF COMPILATION COMPLETED</div>
                    <div>&gt; ROUTING // DISPATCHING SMS AND EMAIL OUTBOUND MESSAGES</div>
                    <div>&gt; TRIGGER // NEW BOOKING DETECTED IN WORKSPACE</div>
                    <div>&gt; DATA // PROCESSING LEAD CONTEXT PROFILE FIELDS</div>
                  </div>
                </div>
              </div>

              {/* View 3: [ win back ] */}
              <div className="viz-winback flex-1 flex flex-col justify-between h-full font-mono text-[9px]">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5 text-zinc-400 select-none">
                  <span className="flex items-center gap-1.5 uppercase font-bold">LIVE_TELEMETRY // WIN_BACK</span>
                  <span>[ACTIVE]</span>
                </div>
                <div className="my-3.5 h-32 border border-zinc-800 bg-zinc-950/40 flex items-center justify-center gap-5 text-center select-none">
                  <div className="border border-zinc-800 p-2 bg-zinc-900/40"><div className="text-amber-500 font-bold uppercase tracking-wider text-[8px]">No-Show</div><span className="text-zinc-500">TRIGGER</span></div>
                  <svg className="w-8 h-2 shrink-0" fill="none" viewBox="0 0 32 16"><path d="M 0 8 H 32" stroke="#f59e0b" strokeWidth="1" strokeDasharray="3 3" style={{ animation: "dataFlowMove 0.8s linear infinite" }} /></svg>
                  <div className="border border-zinc-800 p-2 bg-zinc-900/40"><div className="text-zinc-400 font-bold uppercase text-[8px]">30-DAY SEQUENCE</div><span className="text-zinc-500">RECOVERY</span></div>
                </div>
                <div className="p-3 bg-zinc-950 border border-zinc-900 text-zinc-400 h-[56px] overflow-hidden relative rounded-sm leading-normal select-text">
                  <div className="space-y-1 animate-[logStreamScroll_7s_infinite_linear]">
                    <div>&gt; TRIGGER // NO-SHOW OR CANCELLATION DETECTED</div>
                    <div>&gt; SCHEDULER // PREPARING ACTIVE RECOVERY TIMELINE</div>
                    <div>&gt; CAMPAIGN // COMPILING AUTOMATED OUTREACH TOUCHPOINTS</div>
                    <div>&gt; POLICIES // RUNNING COMPLIANCE SEND FREQUENCY SAFETY CHECKS</div>
                    <div>&gt; DATABASE // PERSISTING RECOVERY ENROLLMENT RECORD</div>
                    <div>&gt; TRIGGER // NO-SHOW OR CANCELLATION DETECTED</div>
                    <div>&gt; SCHEDULER // PREPARING ACTIVE RECOVERY TIMELINE</div>
                  </div>
                </div>
              </div>

              {/* View 4: [ leak map ] */}
              <div className="viz-leakmap flex-1 flex flex-col justify-between h-full font-mono text-[9px]">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5 text-zinc-400 select-none">
                  <span className="flex items-center gap-1.5 uppercase font-bold">LIVE_TELEMETRY // LEAK_MAP</span>
                  <span>[ACTIVE]</span>
                </div>
                <div className="my-3.5 h-32 border border-zinc-800 bg-zinc-950/40 grid grid-cols-3 gap-2 p-3 text-center items-center select-none">
                  <div className="border border-zinc-900/60 py-2"><span className="text-zinc-600 block text-[8px]">FUNNEL_DATA_PULL</span><span className="text-zinc-300">n=38</span></div>
                  <div className="border border-zinc-900/60 py-2 border-dashed border-rose-900 bg-rose-950/10 animate-pulse"><span className="text-rose-400 block text-[8px]">LEAK_CHECK_DELTA</span><span className="text-rose-400 font-bold">-34%</span></div>
                  <div className="border border-zinc-900/60 py-2"><span className="text-zinc-600 block text-[8px]">SEVERITY</span><span className="text-zinc-300">HIGH</span></div>
                </div>
                <div className="p-3 bg-zinc-950 border border-zinc-900 text-zinc-400 h-[56px] overflow-hidden relative rounded-sm leading-normal select-text">
                  <div className="space-y-1 animate-[logStreamScroll_7s_infinite_linear]">
                    <div>&gt; CRON // INITIALIZING FUNNEL INTEGRITY ANALYSIS</div>
                    <div>&gt; DATABASE // QUERYING RECENT pipeline RUN_LOGS</div>
                    <div>&gt; COMPUTE // AGGREGATING ENGAGEMENT METRICS IN MEMORY</div>
                    <div>&gt; METRICS // CALCULATING SHOW-RATES AND MESSAGE OPEN-RATES</div>
                    <div>&gt; VALIDATION // CHECKING METRIC STATISTICAL DATA FLOOR</div>
                    <div>&gt; REPORT // GENERATING FUNNEL ANOMALY RECOMMENDATION</div>
                    <div>&gt; CRON // INITIALIZING FUNNEL INTEGRITY ANALYSIS</div>
                  </div>
                </div>
              </div>

              {/* View 5: [ pre-call reads ] */}
              <div className="viz-precall flex-1 flex flex-col justify-between h-full font-mono text-[9px]">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5 text-zinc-400 select-none">
                  <span className="flex items-center gap-1.5 uppercase font-bold">LIVE_TELEMETRY // PRE_CALL_READS</span>
                  <span>[ACTIVE]</span>
                </div>
                <div className="my-3.5 h-32 border border-zinc-800 bg-zinc-950/40 flex flex-col justify-between p-3 leading-relaxed text-zinc-500 select-none">
                  <div className="flex justify-between text-zinc-400"><span>IDENTITY_MATCH_ACCURACY:</span><span className="text-sky-400 font-bold">99 / 100 ACCURACY</span></div>
                  <div className="flex gap-2"><span className="border border-zinc-800 px-1.5 py-0.5 bg-zinc-900 text-zinc-300">✓ COMPANY DOMAIN VERIFIED</span><span className="border border-zinc-800 px-1.5 py-0.5 bg-zinc-900 text-zinc-300">✓ VERIFIED PROFILE REFERENCED</span></div>
                  <div className="text-[8px] text-zinc-600 truncate animate-pulse">&gt; SEARCHING SECURE CHANNELS... PRIVATELY DATA INSIGHTS COMPILING</div>
                </div>
                <div className="p-3 bg-zinc-950 border border-zinc-900 text-zinc-400 h-[56px] overflow-hidden relative rounded-sm leading-normal select-text">
                  <div className="space-y-1 animate-[logStreamScroll_7s_infinite_linear]">
                    <div>&gt; CRON // RUNNING AUTOMATED BRIEFING COMPILATION</div>
                    <div>&gt; SECURITY // DECRYPTING ACCESS KEY FOR UPCOMING APPOINTMENTS</div>
                    <div>&gt; CROSS_CHECK // RUNNING CONTEXT RATING FOR PROSPECT IDENTITIES</div>
                    <div>&gt; DATA // SEPARATING BUSINESS DOMAINS FROM PUBLIC CONSUMER MAILS</div>
                    <div>&gt; INTEL // PARSING ACCURATE PROFESSIONAL BACKGROUND INSIGHTS</div>
                    <div>&gt; OUTPUT // COMPILING 7-SECTION SALES TEAM BRIEF</div>
                    <div>&gt; CRON // RUNNING AUTOMATED BRIEFING COMPILATION</div>
                  </div>
                </div>
              </div>

              {/* ── STANDARD ORIGINAL CONTENT STATE ── */}
              <div className="default-login-content flex-1 flex flex-col justify-between h-full">
                <div className="space-y-6">
                  <div className="flex items-center justify-between border-b border-zinc-800 pb-4 font-mono text-[10px] tracking-widest text-zinc-500 uppercase">
                    <span>SHOW TIME // AUTH_MODE</span>
                    <span>[01]</span>
                  </div>

                  <div className="space-y-2">
                    <label className="block font-mono text-xs uppercase tracking-wider text-zinc-400">
                      Dashboard Access
                    </label>
                    <p className="text-xs text-zinc-500 leading-normal">
                      Initialize pile-on, pin-downs, pre-call reads, win backs && leak-maps.
                    </p>
                  </div>

                  {membershipRequired && (
                    <div className="rounded border border-amber-500/20 bg-amber-500/5 p-3.5 text-left text-xs text-amber-400 font-mono space-y-1">
                      <div className="font-semibold uppercase tracking-wider text-amber-500">
                        ! ACCESS_DENIED
                      </div>
                      <p className="text-zinc-400 leading-normal">
                        {session.whopUserId
                          ? "Whop profile active, but missing a valid execution license. Verify token status."
                          : "No authentication credentials found. Initialize network layer below."}
                      </p>
                    </div>
                  )}
                </div>

                {/* BACKGROUND DIAGNOSTIC TELEMETRY LOGGER: Active during static standby periods */}
                <div className="my-2 p-2.5 bg-zinc-950 border border-zinc-900/60 text-[9px] font-mono text-zinc-600 h-[40px] overflow-hidden relative rounded-sm leading-normal select-none">
                  <div className="space-y-1 animate-[logStreamScroll_9s_infinite_linear]">
                    <div>&gt; SYSTEM_DAEMON // CENTRAL AUTOMATION NODE ACTIVE</div>
                    <div>&gt; SYNC // LISTENING FOR APPOINTMENT TRIGGERS... NOMINAL</div>
                    <div>&gt; DATABASE // POOLED LINK ESTABLISHED AND SECURED</div>
                    <div>&gt; TELEMETRY // AWAITING OPERATOR DISPATCH SCAN HOVER...</div>
                    <div>&gt; SYSTEM_DAEMON // CENTRAL AUTOMATION NODE ACTIVE</div>
                    <div>&gt; SYNC // LISTENING FOR APPOINTMENT TRIGGERS... NOMINAL</div>
                  </div>
                </div>

             {/* CHANGE THIS BLOCK AT THE BOTTOM OF APP/PAGE.TSX */}
<div className="pt-2">
  {session.whopUserId && hasAccess ? (
    // Change href from "/dashboard" to "/home"
    <a href="/home" className="block w-full"> 
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

            </div>

            {/* Asset 5: Stacked Paper Collage Backdrop Component Overlay */}
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
        <footer className="w-full pb-8 flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-zinc-600 border-t border-zinc-900/60 pt-6">
          <div>MUDD VENTURES v1.34</div>
          <div>STATUS // NOMINAL</div>
        </footer>
      </div>
    </div>
  );
}