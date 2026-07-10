import { getSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { LayoutGrid, ShieldAlert, Layers, ExternalLink } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

// Easily scale your ecosystem up to 15+ items by adding objects here
const PRODUCTS = [
  {
    id: "showtime",
    name: "Showtime",
    tagline: "NODE_01 // ACTIVE",
    description: "High-ticket revenue infrastructure panel. Oversight of client onboarding flows, calendar hooks, pre-call AI briefings, and funnel leak metrics.",
    href: "/dashboard",
    status: "active",
    statusLabel: "[ Enter Workspace ]",
  },
  {
    id: "counter-claim",
    name: "Counter Claim",
    tagline: "NODE_02 // BETA",
    description: "Automated dispute mitigation network. Generates dynamic representment evidence packs, chargeback responses, and malicious transaction alerts.",
    href: "/counter-claim",
    status: "development",
    statusLabel: "Under Development",
  },
];

export default async function MultiProductHubPage() {
  const session = await getSession();

  return (
    <div className="relative min-h-screen bg-zinc-950 text-zinc-50 font-sans overflow-x-hidden selection:bg-zinc-800">
      
      {/* Background Matrix Mesh Accent Grid */}
      <div className="absolute inset-0 grid grid-cols-6 md:grid-cols-12 grid-rows-6 pointer-events-none opacity-10 z-0">
        {Array.from({ length: 48 }).map((_, i) => (
          <div key={i} className="border-[0.5px] border-zinc-800" />
        ))}
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-6 py-12 min-h-screen flex flex-col justify-between">
        
        {/* Hub Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between border-b border-zinc-200 dark:border-zinc-900 pb-6 gap-4 font-mono">
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 font-bold">
              CENTRAL_APPLICATION_CORE // RUNTIME_V1.34
            </div>
            <div className="text-sm text-muted-foreground dark:text-zinc-300">
              Welcome back, <span className="text-foreground underline underline-offset-4 font-bold">{session.email}</span>
            </div>
          </div>
          
          <div className="flex items-center gap-4 self-start md:self-auto">
            <div className="text-[11px] uppercase tracking-widest text-zinc-600 bg-muted/30 border border-border px-3 py-1.5">
              SYSTEM // AUTHENTICATED
            </div>
            <ThemeToggle />
          </div>
        </header>

        {/* Scalable Platform Grid Layout */}
        <main className="py-12 my-auto space-y-10">
          <div className="space-y-2 max-w-xl">
            <h1 className="text-3xl font-black uppercase tracking-tight text-zinc-100 sm:text-4xl">
              Mudd Application Suite
            </h1>
            <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
              Launch localized infrastructure engines below. Your authenticated access clearance allows seamless navigation across provisioned workspaces.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {PRODUCTS.map((product) => {
              const isActive = product.status === "active";
              
              return (
                <div 
                  key={product.id}
                  className={`relative border p-6 flex flex-col justify-between transition-all group shadow-[10px_10px_0px_0px_rgba(9,9,11,0.4)] min-h-[260px] ${
                    isActive 
                      ? "border-zinc-800 bg-zinc-900/40 hover:border-zinc-700" 
                      : "border-zinc-900 bg-zinc-950/40 opacity-60 border-dashed"
                  }`}
                >
                  {/* Structural Card Tech Corners */}
                  <div className="absolute top-0 left-0 w-1.5 h-1.5 border-t border-l border-zinc-800" />
                  <div className="absolute top-0 right-0 w-1.5 h-1.5 border-t border-r border-zinc-800" />
                  <div className="absolute bottom-0 left-0 w-1.5 h-1.5 border-b border-l border-zinc-800" />
                  <div className="absolute bottom-0 right-0 w-1.5 h-1.5 border-b border-r border-zinc-800" />

                  <div className="space-y-3">
                    <div className="flex items-center justify-between border-b border-zinc-900 pb-2.5 font-mono text-[9px] tracking-widest text-zinc-500 uppercase">
                      <span>{product.tagline}</span>
                      {isActive && <span className="text-emerald-400 font-bold animate-pulse">&bull;</span>}
                    </div>
                    
                    <h2 className="text-xl font-extrabold uppercase tracking-wide text-zinc-100">
                      {product.name}
                    </h2>
                    
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      {product.description}
                    </p>
                  </div>

                  <div className="pt-6">
                    {isActive ? (
                      <a href={product.href} className="block w-full">
                        <Button className="w-full h-10 text-xs font-mono uppercase tracking-widest bg-zinc-100 text-zinc-950 rounded-none hover:bg-zinc-200 transition-all cursor-pointer">
                          {product.statusLabel}
                        </Button>
                      </a>
                    ) : (
                      <Button 
                        disabled 
                        className="w-full h-10 text-xs font-mono uppercase tracking-widest border border-zinc-900 bg-transparent text-zinc-600 rounded-none select-none pointer-events-none"
                      >
                        {product.statusLabel}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </main>

        {/* Global Hub Footer */}
        <footer className="w-full border-t border-zinc-900/60 pt-6 flex flex-col sm:flex-row items-center justify-between font-mono text-[9px] uppercase tracking-widest text-zinc-600 gap-2">
          <div>MUDD VENTURES HOLDINGS &copy; 2026</div>
          <div className="flex gap-4">
            <a href="/api/auth/logout" className="hover:text-zinc-400 transition-colors">[ Clear Session ]</a>
          </div>
        </footer>

      </div>
    </div>
  );
}