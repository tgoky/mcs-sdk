"use client";

import { useMemo, useState } from "react";
import {
  ExternalLink,
  Copy,
  Check,
  Code2,
  Globe,
  Webhook,
  Palette,
  Film,
  Megaphone,
  AlertCircle,
  Clock,
  ScanSearch,
  Search,
  Maximize2,
  Sliders,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { bookingPlatformLabel, hostingPlatformLabel } from "@/lib/copy";
import { Dropdown } from "@/components/ui/dropdown";
import { ViewSwitcher, type RunViewMode } from "../_shared/view-switcher";
import { StatusPill } from "../_shared/status-pill";
import { EmptyState } from "../_shared/empty-state";
import { Sheet, SheetContent, SheetHeader, SheetBody, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import type { PinDownDetail } from "../_shared/types";

const PILLAR_LABEL: Record<string, string> = {
  common_questions: "Common questions",
  deeper_questions: "Deeper questions",
  success_proof: "Success proof",
  objections: "Objections",
};

interface InspectableCard {
  id: string;
  type: "deployment" | "brief" | "script" | "voice" | "stack" | "audit";
  title: string;
  subtitle?: string;
  badge?: string;
  tone?: "success" | "warning" | "danger" | "info" | "neutral";
  payload: any;
}

export function PinDownView({ detail }: { detail: PinDownDetail }) {
  const { run } = detail;
  const [mode, setMode] = useState<RunViewMode>("calendar");
  const [filterText, setFilterText] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activeDrawerCard, setActiveDrawerCard] = useState<InspectableCard | null>(null);

  const deployment = run.confirmationPageDeployment;
  const isLive = deployment?.mode === "live";
  const isPasteReady = deployment?.mode === "paste_ready";
  const isPending = deployment?.mode === "pending_review";

  const handleCopy = (text: string, key: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const briefs = run.adCreativeBriefs?.briefs ?? [];
  const scriptPack = run.pinDownScriptPack;

  // Unroll individual deliverables for Board & List views
  const boardColumns = useMemo(() => {
    const q = filterText.toLowerCase().trim();

    // 1. Platform Setup
    const setupCards: InspectableCard[] = [
      {
        id: "stack-sync",
        type: "stack",
        title: "Platform Stack Sync",
        subtitle: `Booking: ${bookingPlatformLabel(run.stack?.booking_platform)} · Hosting: ${hostingPlatformLabel(run.stack?.hosting_platform)}`,
        badge: run.stack?.webhook_receiver_mode ?? "none",
        tone: run.stack?.webhook_receiver_mode === "webhook" ? "success" : "info",
        payload: run.stack,
      },
    ];

    // 2. Brand & Voice
    const voiceCards: InspectableCard[] = run.brandVoiceProfile
      ? [
          {
            id: "voice-profile",
            type: "voice",
            title: "Brand Voice & Tone Profile",
            subtitle: `Formal/Casual: ${run.brandVoiceProfile.tone.formal_casual.score}/5 · ${run.brandVoiceProfile.vocabulary.signature.length} tokens`,
            badge: run.brandVoiceProfile.source_path === "default" ? "Default Fallback" : "Extracted",
            tone: run.brandVoiceProfile.source_path === "default" ? "neutral" : "info",
            payload: run.brandVoiceProfile,
          },
        ]
      : [];

    // 3. Creative Assets (UNROLLED: Every brief and script is its OWN individual card)
    const creativeCards: InspectableCard[] = [];

    briefs.forEach((b) => {
      creativeCards.push({
        id: `brief-${b.id}`,
        type: "brief",
        title: `Ad Brief: ${PILLAR_LABEL[b.pillar] ?? b.pillar}`,
        subtitle: b.hook,
        badge: b.suggestedFormat,
        tone: "warning",
        payload: b,
      });
    });

    if (scriptPack?.heroScript) {
      creativeCards.push({
        id: "script-hero",
        type: "script",
        title: `Hero Script: ${scriptPack.heroScript.title}`,
        subtitle: `${scriptPack.heroScript.targetLengthSeconds}s target length`,
        badge: "Hero VSL",
        tone: "info",
        payload: scriptPack.heroScript,
      });
    }

    (scriptPack?.breakoutScripts ?? []).forEach((s) => {
      creativeCards.push({
        id: `script-${s.id}`,
        type: "script",
        title: `Breakout Script: ${s.title}`,
        subtitle: s.script.slice(0, 80) + "...",
        badge: "Breakout",
        tone: "neutral",
        payload: s,
      });
    });

    // 4. Deployment & Audit
    const deployCards: InspectableCard[] = [
      {
        id: "confirmation-deploy",
        type: "deployment",
        title: "Confirmation Page",
        subtitle: isLive
          ? run.confirmationPageUrl ?? "Published live"
          : isPasteReady
          ? "Paste-Ready Code Generated"
          : "Deployment Pending",
        badge: deployment?.mode ?? "Not Deployed",
        tone: isLive ? "success" : isPasteReady ? "info" : "neutral",
        payload: { deployment, url: run.confirmationPageUrl, html: run.pasteReadyHtml, instructions: run.pasteReadyInstructions },
      },
    ];

    if (run.pinDownPageAudit) {
      deployCards.push({
        id: "page-audit",
        type: "audit",
        title: "Existing Page Audit",
        subtitle: `${run.pinDownPageAudit.existingPageStrengths.length} Strengths · ${run.pinDownPageAudit.existingPageWeaknesses.length} Weaknesses`,
        badge: "Audited",
        tone: "info",
        payload: run.pinDownPageAudit,
      });
    }

    // Apply filter
    const filterFn = (card: InspectableCard) =>
      !q || card.title.toLowerCase().includes(q) || (card.subtitle ?? "").toLowerCase().includes(q);

    return [
      { id: "setup", title: "1. Platform Setup", cards: setupCards.filter(filterFn) },
      { id: "brand", title: "2. Brand & Voice", cards: voiceCards.filter(filterFn) },
      { id: "creative", title: "3. Creative Assets", cards: creativeCards.filter(filterFn) },
      { id: "deployment", title: "4. Deployment & Audit", cards: deployCards.filter(filterFn) },
    ];
  }, [run, briefs, scriptPack, filterText, isLive, isPasteReady, deployment]);

  return (
    <div className="flex flex-col gap-3 font-sans antialiased">
      {/* ----------------------------------------------------------------- */}
      {/* 1. ASANA PERSISTENT TOOLBAR                                       */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-zinc-950 p-1.5 border border-zinc-800">
        <div className="relative w-64">
          <Search size={13} className="absolute left-2.5 top-2.5 text-zinc-500" />
          <input
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Search briefs, scripts, or terms..."
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900 py-1.5 pl-8 pr-2.5 text-xs text-zinc-200 placeholder:text-zinc-500 focus:border-zinc-700 focus:outline-none"
          />
        </div>

        <ViewSwitcher value={mode} onChange={setMode} />
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* 2. OVERVIEW VIEW                                                  */}
      {/* ----------------------------------------------------------------- */}
      {mode === "calendar" && (
        <>
          {/* Hero Deployment Banner */}
          <div
            className={cn(
              "flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 shadow-xl transition-all",
              isLive && "border-emerald-900/50 bg-emerald-950/10",
              isPasteReady && "border-sky-900/50 bg-sky-950/10",
              isPending && "border-orange-900/50 bg-orange-950/10",
              !deployment && "border-zinc-800 bg-zinc-900/30"
            )}
          >
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full border shrink-0",
                  isLive && "bg-emerald-500/15 text-emerald-400 border-emerald-900/50",
                  isPasteReady && "bg-sky-500/15 text-sky-400 border-sky-900/50",
                  isPending && "bg-orange-500/15 text-orange-400 border-orange-900/50",
                  !deployment && "bg-zinc-800 text-zinc-500 border-zinc-700"
                )}
              >
                <Globe size={16} />
              </div>
              <div>
                <p className="text-sm font-bold text-white">
                  {isLive && "Published Live on Buyer Stack"}
                  {isPasteReady && "Paste-Ready Code Generated"}
                  {isPending && "Pending Manual Approval"}
                  {deployment?.mode === "not_deployed" && "Not Deployed"}
                  {!deployment && "No Deployment Record Found"}
                </p>
                <p className="text-xs text-zinc-500 font-mono">
                  {deployment?.deployedVia
                    ? `Target: ${hostingPlatformLabel(deployment.deployedVia)}`
                    : "No deployment target recorded"}
                  {deployment?.reason ? ` — ${deployment.reason}` : ""}
                </p>
              </div>
            </div>
            {isLive && run.confirmationPageUrl && (
              <a
                href={run.confirmationPageUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-zinc-950 hover:bg-emerald-400 transition-colors"
              >
                Open live page <ExternalLink size={12} />
              </a>
            )}
          </div>

          {/* 2x2 Deliverables Grid */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <PrimaryOutputCard run={run} onCopy={handleCopy} copiedKey={copiedKey} />
            <BrandVoiceCard run={run} onCopy={handleCopy} copiedKey={copiedKey} />
            <PlatformSyncCard run={run} />
            <CreativeAssetsCard run={run} onCopy={handleCopy} copiedKey={copiedKey} />
          </div>

          {run.pinDownPageAudit && <ExistingPageAuditCard audit={run.pinDownPageAudit} />}
        </>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* 3. DENSE LIST VIEW                                                */}
      {/* ----------------------------------------------------------------- */}
      {mode === "list" && (
        <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-800/60 text-[10px] uppercase text-zinc-500 bg-zinc-900/50">
                <th className="px-4 py-2 font-semibold">Deliverable Type</th>
                <th className="px-4 py-2 font-semibold">Asset Details</th>
                <th className="px-4 py-2 font-semibold">Status / Target</th>
                <th className="px-4 py-2 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {boardColumns.flatMap((col) =>
                col.cards.map((card) => (
                  <tr
                    key={card.id}
                    className="border-b border-zinc-900 last:border-b-0 hover:bg-zinc-900/40 cursor-pointer transition-colors"
                    onClick={() => setActiveDrawerCard(card)}
                  >
                    <td className="px-4 py-2.5 font-medium text-white flex items-center gap-2">
                      {card.type === "brief" && <Megaphone size={12} className="text-amber-400" />}
                      {card.type === "script" && <Film size={12} className="text-sky-400" />}
                      {card.type === "deployment" && <Code2 size={12} className="text-emerald-400" />}
                      {card.type === "voice" && <Palette size={12} className="text-amber-400" />}
                      {card.type === "stack" && <Webhook size={12} className="text-emerald-400" />}
                      {card.type === "audit" && <ScanSearch size={12} className="text-sky-400" />}
                      {card.title}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-300 truncate max-w-xs font-sans">
                      {card.subtitle}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-zinc-400">
                      {card.badge && <StatusPill tone={card.tone ?? "neutral"}>{card.badge}</StatusPill>}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveDrawerCard(card);
                        }}
                        className="rounded-lg border border-zinc-700 px-2.5 py-1 text-[11px] font-semibold text-zinc-300 hover:bg-zinc-800 cursor-pointer"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* 4. ASANA KANBAN BOARD VIEW (UNROLLED CARDS + DRAWER TRIGGER)      */}
      {/* ----------------------------------------------------------------- */}
      {mode === "board" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {boardColumns.map((col) => (
            <div key={col.id} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between px-1 mb-1">
                <span className="text-xs font-bold text-zinc-300">{col.title}</span>
                <span className="text-[10px] font-mono text-zinc-500 bg-zinc-900 px-2 py-0.5 rounded-md font-bold">
                  {col.cards.length}
                </span>
              </div>

              <div className="space-y-2">
                {col.cards.map((card) => (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => setActiveDrawerCard(card)}
                    className="w-full text-left rounded-xl border border-zinc-800 bg-zinc-900/90 hover:border-zinc-700 p-3 transition-all cursor-pointer group shadow-sm flex flex-col gap-1.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-bold text-white group-hover:text-amber-400 transition-colors flex items-center gap-1.5">
                        {card.type === "brief" && <Megaphone size={12} className="text-amber-400 shrink-0" />}
                        {card.type === "script" && <Film size={12} className="text-sky-400 shrink-0" />}
                        {card.type === "deployment" && <Globe size={12} className="text-emerald-400 shrink-0" />}
                        {card.type === "voice" && <Palette size={12} className="text-amber-400 shrink-0" />}
                        {card.type === "stack" && <Webhook size={12} className="text-emerald-400 shrink-0" />}
                        {card.type === "audit" && <ScanSearch size={12} className="text-sky-400 shrink-0" />}
                        <span className="truncate">{card.title}</span>
                      </p>
                      <Maximize2 size={12} className="text-zinc-600 group-hover:text-zinc-300 shrink-0 mt-0.5" />
                    </div>

                    {card.subtitle && (
                      <p className="text-[11px] text-zinc-400 font-sans leading-snug line-clamp-2">
                        {card.subtitle}
                      </p>
                    )}

                    {card.badge && (
                      <div className="pt-1">
                        <StatusPill tone={card.tone ?? "neutral"} className="text-[9.5px]">
                          {card.badge}
                        </StatusPill>
                      </div>
                    )}
                  </button>
                ))}

                {col.cards.length === 0 && (
                  <div className="rounded-xl border border-dashed border-zinc-900 p-4 text-center text-[10px] text-zinc-600">
                    No items in this stage
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* 5. SLIDE-OVER TASK INSPECTION DRAWER                              */}
      {/* ----------------------------------------------------------------- */}
      <PinDownDetailDrawer
        card={activeDrawerCard}
        onClose={() => setActiveDrawerCard(null)}
        onCopy={handleCopy}
        copiedKey={copiedKey}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// ASANA TASK DETAIL DRAWER (SLIDE-OVER SHEET)
// ---------------------------------------------------------------------------
function PinDownDetailDrawer({
  card,
  onClose,
  onCopy,
  copiedKey,
}: {
  card: InspectableCard | null;
  onClose: () => void;
  onCopy: (text: string, key: string) => void;
  copiedKey: string | null;
}) {
  return (
    <Sheet open={!!card} onOpenChange={(open) => !open && onClose()}>
      <SheetContent widthClassName="w-full sm:max-w-xl">
        {card && (
          <>
            <SheetHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-amber-400">
                  <Sliders size={15} />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 font-mono">
                    Pin-Down Deliverable
                  </span>
                </div>
                {card.badge && <StatusPill tone={card.tone ?? "neutral"}>{card.badge}</StatusPill>}
              </div>

              <SheetTitle className="mt-2 text-lg font-bold text-white">{card.title}</SheetTitle>
              {card.subtitle && (
                <SheetDescription className="text-xs text-zinc-400 font-sans">{card.subtitle}</SheetDescription>
              )}
            </SheetHeader>

            <SheetBody className="space-y-4 pt-2">
              {/* Brief Content */}
              {card.type === "brief" && (
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">Ad Creative Copy</span>
                    <button
                      type="button"
                      onClick={() =>
                        onCopy(
                          `Hook: ${card.payload.hook}\nAngle: ${card.payload.angle}\nFormat: ${card.payload.suggestedFormat}\nCTA: ${card.payload.cta}`,
                          "drawer-brief"
                        )
                      }
                      className="flex items-center gap-1 text-xs font-mono text-zinc-300 hover:text-white cursor-pointer"
                    >
                      {copiedKey === "drawer-brief" ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                      <span>{copiedKey === "drawer-brief" ? "Copied" : "Copy Brief"}</span>
                    </button>
                  </div>
                  <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-900/80 p-4 text-xs text-zinc-200">
                    <p><strong className="text-zinc-400">Pillar:</strong> {PILLAR_LABEL[card.payload.pillar] ?? card.payload.pillar}</p>
                    <p><strong className="text-zinc-400">Hook:</strong> {card.payload.hook}</p>
                    <p><strong className="text-zinc-400">Angle:</strong> {card.payload.angle}</p>
                    <p><strong className="text-zinc-400">Format:</strong> {card.payload.suggestedFormat}</p>
                    <p><strong className="text-zinc-400">CTA:</strong> {card.payload.cta}</p>
                  </div>
                </div>
              )}

              {/* Script Content */}
              {card.type === "script" && (
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">Full Video Script</span>
                    <button
                      type="button"
                      onClick={() =>
                        onCopy(
                          "chapters" in card.payload
                            ? card.payload.chapters.map((c: any) => c.script).join("\n\n")
                            : card.payload.script,
                          "drawer-script"
                        )
                      }
                      className="flex items-center gap-1 text-xs font-mono text-zinc-300 hover:text-white cursor-pointer"
                    >
                      {copiedKey === "drawer-script" ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                      <span>{copiedKey === "drawer-script" ? "Copied" : "Copy Script"}</span>
                    </button>
                  </div>

                  {"chapters" in card.payload ? (
                    <div className="space-y-2">
                      {card.payload.chapters.map((chap: any, idx: number) => (
                        <div key={idx} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-xs text-zinc-300">
                          <p className="font-bold text-amber-400 mb-1">{chap.title}</p>
                          <p className="whitespace-pre-wrap leading-relaxed">{chap.script}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3.5 text-xs leading-relaxed text-zinc-300 whitespace-pre-wrap">
                      {card.payload.script}
                    </div>
                  )}
                </div>
              )}

              {/* Deployment / HTML */}
              {card.type === "deployment" && (
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">Page Code / Target</span>
                    {card.payload.html && (
                      <button
                        type="button"
                        onClick={() => onCopy(card.payload.html, "drawer-html")}
                        className="flex items-center gap-1 text-xs font-mono text-zinc-300 hover:text-white cursor-pointer"
                      >
                        {copiedKey === "drawer-html" ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                        <span>{copiedKey === "drawer-html" ? "Copied" : "Copy HTML"}</span>
                      </button>
                    )}
                  </div>

                  {card.payload.url && (
                    <a
                      href={card.payload.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-between p-3 rounded-xl border border-emerald-900/50 bg-emerald-950/20 text-xs font-bold text-emerald-400 hover:bg-emerald-950/40 transition-colors"
                    >
                      <span>Open Live Deployed Page</span>
                      <ExternalLink size={13} />
                    </a>
                  )}

                  {card.payload.html && (
                    <div className="max-h-64 overflow-auto rounded-xl border border-zinc-800 bg-black/60 p-3 font-mono text-[10px] text-zinc-400 leading-relaxed">
                      <pre className="whitespace-pre-wrap break-all">{card.payload.html}</pre>
                    </div>
                  )}

                  {card.payload.instructions && (
                    <p className="text-xs text-zinc-400 leading-relaxed bg-zinc-900/80 border border-zinc-800 p-3 rounded-xl">
                      {card.payload.instructions}
                    </p>
                  )}
                </div>
              )}

              {/* Voice Profile */}
              {card.type === "voice" && (
                <div className="space-y-3 text-xs text-zinc-300">
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-3.5 space-y-2">
                    <p><strong className="text-zinc-400">Formal/Casual:</strong> {card.payload.tone.formal_casual.score}/5 ({card.payload.tone.formal_casual.note})</p>
                    <p><strong className="text-zinc-400">Technical/Plain:</strong> {card.payload.tone.technical_plain.score}/5 ({card.payload.tone.technical_plain.note})</p>
                    <p><strong className="text-zinc-400">Warm/Neutral:</strong> {card.payload.tone.warm_neutral.score}/5 ({card.payload.tone.warm_neutral.note})</p>
                  </div>

                  <div>
                    <span className="block text-[10px] font-mono uppercase tracking-wider text-zinc-400 mb-1.5">Signature Tokens</span>
                    <div className="flex flex-wrap gap-1">
                      {card.payload.vocabulary.signature.map((token: string) => (
                        <span key={token} className="rounded-md bg-zinc-800 px-2 py-0.5 font-mono text-[11px] text-zinc-200">
                          {token}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Stack Sync */}
              {card.type === "stack" && (
                <div className="space-y-2 text-xs text-zinc-300 rounded-xl border border-zinc-800 bg-zinc-900/80 p-3.5 font-mono">
                  <p><strong className="text-zinc-500">Booking Platform:</strong> {bookingPlatformLabel(card.payload?.booking_platform)}</p>
                  <p><strong className="text-zinc-500">Hosting Platform:</strong> {hostingPlatformLabel(card.payload?.hosting_platform)}</p>
                  <p><strong className="text-zinc-500">Webhook Receiver Mode:</strong> {card.payload?.webhook_receiver_mode ?? "none"}</p>
                </div>
              )}

              {/* Audit */}
              {card.type === "audit" && (
                <div className="space-y-3 text-xs">
                  <div>
                    <span className="block text-[10px] font-mono uppercase text-emerald-400 mb-1">Strengths</span>
                    <ul className="space-y-1 text-zinc-300">
                      {card.payload.existingPageStrengths.map((s: string, i: number) => (
                        <li key={i}>✓ {s}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <span className="block text-[10px] font-mono uppercase text-rose-400 mb-1">Weaknesses</span>
                    <ul className="space-y-1 text-zinc-300">
                      {card.payload.existingPageWeaknesses.map((w: string, i: number) => (
                        <li key={i}>✕ {w}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </SheetBody>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// OVERVIEW SUB-COMPONENTS
// ---------------------------------------------------------------------------
function Card({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="flex flex-col rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-md">
      <div className="mb-3 flex items-center gap-2 border-b border-zinc-900 pb-2">
        <Icon size={14} className="text-zinc-400" />
        <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-300">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function PrimaryOutputCard({
  run,
  onCopy,
  copiedKey,
}: {
  run: PinDownDetail["run"];
  onCopy: (text: string, key: string) => void;
  copiedKey: string | null;
}) {
  const isPasteReady = run.confirmationPageDeployment?.mode === "paste_ready";

  return (
    <Card title="Confirmation Page Deliverable" icon={Code2}>
      {isPasteReady && run.pasteReadyHtml ? (
        <>
          <div className="max-h-48 overflow-auto rounded-xl border border-zinc-800 bg-black/40 p-3 font-mono">
            <pre className="whitespace-pre-wrap break-all text-[10px] leading-relaxed text-zinc-400">
              {run.pasteReadyHtml}
            </pre>
          </div>
          <button
            type="button"
            onClick={() => onCopy(run.pasteReadyHtml!, "html")}
            className="mt-2.5 flex w-fit items-center gap-1.5 rounded-lg border border-zinc-700 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-300 hover:bg-zinc-800 cursor-pointer transition-colors"
          >
            {copiedKey === "html" ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
            <span>{copiedKey === "html" ? "Copied HTML" : "Copy HTML Code"}</span>
          </button>
          {run.pasteReadyInstructions && (
            <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">{run.pasteReadyInstructions}</p>
          )}
        </>
      ) : run.confirmationPageUrl ? (
        <div className="overflow-hidden rounded-xl border border-zinc-800">
          <iframe
            src={run.confirmationPageUrl}
            className="h-48 w-full bg-white"
            sandbox="allow-same-origin"
            title="Confirmation page preview"
          />
        </div>
      ) : (
        <EmptyState
          icon={Code2}
          title="No Page Recorded"
          description="No confirmation page URL or paste-ready HTML code has been recorded for this engagement."
        />
      )}
    </Card>
  );
}

function BrandVoiceCard({
  run,
  onCopy,
  copiedKey,
}: {
  run: PinDownDetail["run"];
  onCopy: (text: string, key: string) => void;
  copiedKey: string | null;
}) {
  const v = run.brandVoiceProfile;
  if (!v)
    return (
      <Card title="Brand Voice & Positioning" icon={Palette}>
        <EmptyState
          icon={Palette}
          title="Voice Profile Pending"
          description="Brand voice extraction hasn't run for this engagement yet."
        />
      </Card>
    );

  const tones: Array<[string, { score: number; note: string }]> = [
    ["Formal ↔ Casual", v.tone.formal_casual],
    ["Technical ↔ Plain", v.tone.technical_plain],
    ["Warm ↔ Neutral", v.tone.warm_neutral],
  ];

  return (
    <Card title="Brand Voice & Positioning" icon={Palette}>
      <div className="space-y-2.5">
        {tones.map(([label, t]) => (
          <div key={label}>
            <div className="mb-1 flex items-center justify-between text-[10px] text-zinc-500 font-mono">
              <span>{label}</span>
              <span>{t.score}/5</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-amber-400 transition-all"
                style={{ width: `${(t.score / 5) * 100}%` }}
              />
            </div>
            <p className="mt-0.5 text-[10px] text-zinc-500">{t.note}</p>
          </div>
        ))}
      </div>

      {v.vocabulary.signature.length > 0 && (
        <div className="mt-3 border-t border-zinc-900 pt-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] uppercase text-zinc-500 font-mono">Signature Vocabulary</span>
            <button
              type="button"
              onClick={() => onCopy(v.vocabulary.signature.join(", "), "vocab")}
              className="text-[10px] text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              {copiedKey === "vocab" ? "Copied" : "Copy Tokens"}
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {v.vocabulary.signature.map((w) => (
              <span key={w} className="rounded-md bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-300 font-mono">
                {w}
              </span>
            ))}
          </div>
        </div>
      )}

      {v.banned_phrases.length > 0 && (
        <div className="mt-2.5">
          <p className="mb-1 flex items-center gap-1 text-[10px] uppercase text-zinc-500 font-mono">
            <AlertCircle size={10} /> Banned Phrases
          </p>
          <div className="flex flex-wrap gap-1">
            {v.banned_phrases.map((b) => (
              <span key={b.phrase} className="rounded-md bg-rose-950/40 px-1.5 py-0.5 text-[10px] text-rose-400 border border-rose-900/30 font-mono">
                {b.phrase}
              </span>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function PlatformSyncCard({ run }: { run: PinDownDetail["run"] }) {
  const stack = run.stack;
  if (!stack)
    return (
      <Card title="Platform Sync" icon={Webhook}>
        <EmptyState
          icon={Webhook}
          title="No Stack Configured"
          description="This engagement has no platform stack recorded yet."
        />
      </Card>
    );

  return (
    <Card title="Platform Sync" icon={Webhook}>
      <div className="space-y-2 text-xs">
        <Row label="Booking Platform" value={bookingPlatformLabel(stack.booking_platform)} />
        <Row label="Hosting Platform" value={hostingPlatformLabel(stack.hosting_platform)} />
        <div className="flex items-center justify-between border-t border-zinc-900 pt-2">
          <span className="text-zinc-500">Webhook Receiver Mode</span>
          <StatusPill tone={stack.webhook_receiver_mode === "webhook" ? "success" : stack.webhook_receiver_mode === "polling" ? "info" : "neutral"}>
            {stack.webhook_receiver_mode ?? "none"}
          </StatusPill>
        </div>
        {stack.webhook_last_received_at && (
          <Row label="Last Webhook Received" value={new Date(stack.webhook_last_received_at).toLocaleString()} icon={Clock} />
        )}
        {stack.webhook_last_error && (
          <p className="rounded-lg bg-rose-950/30 border border-rose-900/40 px-2 py-1.5 text-[10px] text-rose-400 font-mono">
            {stack.webhook_last_error}
          </p>
        )}
      </div>
    </Card>
  );
}

function Row({ label, value, icon: Icon }: { label: string; value: string; icon?: React.ElementType }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-zinc-500">{label}</span>
      <span className="flex items-center gap-1 font-medium text-zinc-200">
        {Icon && <Icon size={11} className="text-zinc-500" />}
        {value}
      </span>
    </div>
  );
}

function CreativeAssetsCard({
  run,
  onCopy,
  copiedKey,
}: {
  run: PinDownDetail["run"];
  onCopy: (text: string, key: string) => void;
  copiedKey: string | null;
}) {
  const briefs = run.adCreativeBriefs?.briefs ?? [];
  const scriptPack = run.pinDownScriptPack;
  const [briefKey, setBriefKey] = useState(briefs[0]?.id ?? "");
  const [scriptKey, setScriptKey] = useState<string>("hero");

  const activeBrief = briefs.find((b) => b.id === briefKey) ?? briefs[0];
  const breakouts = scriptPack?.breakoutScripts ?? [];
  const activeScript = scriptKey === "hero" ? scriptPack?.heroScript : breakouts.find((s) => s.id === scriptKey);

  if (briefs.length === 0 && !scriptPack) {
    return (
      <Card title="Generated Creative Assets" icon={Film}>
        <EmptyState
          icon={Film}
          title="No Creative Assets"
          description="Ad creative briefs and the video script pack haven't been generated for this engagement yet."
        />
      </Card>
    );
  }

  return (
    <Card title="Generated Creative Assets" icon={Film}>
      {briefs.length > 0 && (
        <div className="mb-3">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1 text-[10px] uppercase text-zinc-500 font-mono">
              <Megaphone size={10} /> Ad Creative Brief
            </span>
            <div className="flex items-center gap-2">
              <Dropdown
                variant="field"
                items={briefs.map((b) => ({ key: b.id, label: PILLAR_LABEL[b.pillar] ?? b.pillar }))}
                selectedKey={briefKey || briefs[0]?.id}
                onSelect={setBriefKey}
                triggerClassName="w-36 py-1"
              />
              {activeBrief && (
                <button
                  type="button"
                  onClick={() =>
                    onCopy(
                      `Hook: ${activeBrief.hook}\nAngle: ${activeBrief.angle}\nFormat: ${activeBrief.suggestedFormat}\nCTA: ${activeBrief.cta}`,
                      "brief"
                    )
                  }
                  className="text-[10px] font-mono text-zinc-400 hover:text-white transition-colors cursor-pointer"
                >
                  {copiedKey === "brief" ? "Copied" : "Copy Brief"}
                </button>
              )}
            </div>
          </div>
          {activeBrief && (
            <div className="space-y-1.5 rounded-xl border border-zinc-800 bg-zinc-900/60 p-2.5 text-[11px] text-zinc-300">
              <p><span className="text-zinc-500">Hook:</span> {activeBrief.hook}</p>
              <p><span className="text-zinc-500">Angle:</span> {activeBrief.angle}</p>
              <p><span className="text-zinc-500">Format:</span> {activeBrief.suggestedFormat}</p>
              <p><span className="text-zinc-500">CTA:</span> {activeBrief.cta}</p>
            </div>
          )}
        </div>
      )}

      {scriptPack && (
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[10px] uppercase text-zinc-500 font-mono">Video Script Pack</span>
            <div className="flex items-center gap-2">
              <Dropdown
                variant="field"
                items={[
                  { key: "hero", label: scriptPack.heroScript.title },
                  ...breakouts.map((s) => ({ key: s.id, label: s.title })),
                ]}
                selectedKey={scriptKey}
                onSelect={setScriptKey}
                triggerClassName="w-36 py-1"
              />
              {activeScript && (
                <button
                  type="button"
                  onClick={() =>
                    onCopy(
                      "chapters" in activeScript
                        ? activeScript.chapters.map((c) => c.script).join("\n\n")
                        : activeScript.script,
                      "script"
                    )
                  }
                  className="text-[10px] font-mono text-zinc-400 hover:text-white transition-colors cursor-pointer"
                >
                  {copiedKey === "script" ? "Copied" : "Copy Script"}
                </button>
              )}
            </div>
          </div>
          {activeScript && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-2.5 text-[11px] text-zinc-400">
              <p className="text-zinc-300 font-mono text-[10px]">
                {"targetLengthSeconds" in activeScript ? `${activeScript.targetLengthSeconds}s target length` : ""}
              </p>
              <p className="mt-1 line-clamp-3">
                {"chapters" in activeScript ? activeScript.chapters[0]?.script : activeScript.script}
              </p>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function ExistingPageAuditCard({ audit }: { audit: NonNullable<PinDownDetail["run"]["pinDownPageAudit"]> }) {
  return (
    <Card title={`Existing Page Audit — ${audit.auditedUrl}`} icon={ScanSearch}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <AuditList label="Strengths" tone="success" items={audit.existingPageStrengths} />
        <AuditList label="Weaknesses" tone="danger" items={audit.existingPageWeaknesses} />
        <AuditList label="v1 Improvements" tone="info" items={audit.v1Improvements} />
      </div>
    </Card>
  );
}

function AuditList({ label, tone, items }: { label: string; tone: "success" | "danger" | "info"; items: string[] }) {
  const dot = { success: "bg-emerald-400", danger: "bg-rose-400", info: "bg-sky-400" }[tone];
  return (
    <div>
      <p className="mb-1.5 text-[10px] uppercase text-zinc-500 font-mono">{label}</p>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex gap-1.5 text-[11px] leading-snug text-zinc-400">
            <span className={cn("mt-1.5 h-1 w-1 shrink-0 rounded-full", dot)} />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}