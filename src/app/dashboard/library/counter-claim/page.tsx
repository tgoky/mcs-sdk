import { BackLink } from "@/components/back-link";
import { Lock, Brain, Database, Bell, ShieldCheck, MessageSquare, Radar } from "lucide-react";

export const dynamic = "force-dynamic";

const WHATS_COMING = [
  {
    icon: Brain,
    title: "AI engine panel",
    body: "46-prompt panel wired to ChatGPT, Claude, Perplexity, Grok, and Gemini with your own API keys.",
  },
  {
    icon: MessageSquare,
    title: "Trustpilot & Reddit ingestion",
    body: "Read-only review ingestion plus a comment-only 'Move C' ramp tracker for Reddit mentions.",
  },
  {
    icon: Bell,
    title: "Scheduled runs & alerts",
    body: "7am/7pm recurring runs with ntfy.sh push notifications and Twilio SMS fallback.",
  },
  {
    icon: ShieldCheck,
    title: "Crisis playbook",
    body: "Threshold-80 trigger evaluator with 6 force-trigger classes. Buyer-only authority to declare and publish.",
  },
  {
    icon: Database,
    title: "Schema.org & Wikidata",
    body: "Generates Schema.org JSON-LD plus a Wikidata disambiguation submission ('Move A').",
  },
  {
    icon: Radar,
    title: "Identity graph foundation",
    body: "Counterclaim intake interviews the buyer, writes identity-graph.md, and clones the Python reputation-system-template.",
  },
];

export default function CounterClaimPackagePage() {
  return (
    <div className="w-full max-w-3xl space-y-8 px-6 py-6 font-sans">
      <BackLink href="/dashboard/library" label="Library" />

      <div className="flex items-start gap-4">
        <div className="shrink-0 flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-900 dark:bg-zinc-800/80 border border-zinc-800">
          <img
            src="/images/repm.png"
            alt="Reputation Manager"
            className="w-10 h-10 object-contain"
          />
        </div>
        <div className="min-w-0 pt-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-zinc-200">Reputation Manager</h1>
            <span className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-800/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
              Coming soon
            </span>
          </div>
          <p className="text-sm text-zinc-500 mt-1 leading-relaxed max-w-xl">
            9-skill Reputation workers built for Cowork/explicit-invocation 
            Clones the Python reputation-system-template into your own repo.
          </p>
          <p className="text-[11px] font-mono text-zinc-600 mt-1">By Mudd Labs · v1.0.2</p>
        </div>
      </div>

      <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/20 p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2 text-xs font-mono text-zinc-500">
          <Lock size={13} />
          Not available in this workspace yet
        </div>
        <div className="space-y-4">
          {WHATS_COMING.map((item) => (
            <div key={item.title} className="flex items-start gap-3">
              <item.icon size={16} className="text-zinc-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-bold text-zinc-300">{item.title}</p>
                <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">{item.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}