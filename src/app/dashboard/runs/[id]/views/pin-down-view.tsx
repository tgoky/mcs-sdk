"use client";

import { useState } from "react";
import Link from "next/link";
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
  ClipboardCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { bookingPlatformLabel, hostingPlatformLabel } from "@/lib/copy";
import { Dropdown } from "@/components/ui/dropdown";
import { EmptyState } from "../_shared/empty-state";
import type { PinDownDetail } from "../_shared/types";

const PILLAR_LABEL: Record<string, string> = {
  common_questions: "Common questions",
  deeper_questions: "Deeper questions",
  success_proof: "Success proof",
  objections: "Objections",
};

/**
 * Subtle Muted Badge Component
 */
function MutedBadge({ label }: { label: string }) {
  const norm = label.toLowerCase();

  let bgClass = "bg-zinc-800/80 text-zinc-300 border-zinc-700/80";

  if (norm.includes("live") || norm.includes("success") || norm.includes("webhook")) {
    bgClass = "bg-emerald-500/10 text-emerald-400 border-emerald-900/50";
  } else if (norm.includes("paste") || norm.includes("polling") || norm.includes("sky")) {
    bgClass = "bg-sky-500/10 text-sky-400 border-sky-900/50";
  } else if (norm.includes("pending") || norm.includes("review")) {
    bgClass = "bg-violet-500/10 text-violet-400 border-violet-900/50";
  }

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-mono font-medium border select-none truncate max-w-full",
        bgClass
      )}
    >
      {label}
    </span>
  );
}

export function PinDownView({ detail }: { detail: PinDownDetail }) {
  const { run } = detail;
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

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

  return (
    <div className="flex flex-col gap-4 font-sans antialiased text-zinc-100">
      {/* ----------------------------------------------------------------- */}
      {/* HERO DEPLOYMENT BANNER                                            */}
      {/* ----------------------------------------------------------------- */}
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 shadow-xl transition-all font-sans backdrop-blur-xs",
          isLive && "border-emerald-900/50 bg-emerald-950/10",
          isPasteReady && "border-sky-900/50 bg-sky-950/10",
          isPending && "border-violet-900/50 bg-violet-950/10",
          !deployment && "border-zinc-800/80 bg-transparent"
        )}
      >
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full border shrink-0",
              isLive && "bg-emerald-500/15 text-emerald-400 border-emerald-900/50",
              isPasteReady && "bg-sky-500/15 text-sky-400 border-sky-900/50",
              isPending && "bg-violet-500/15 text-violet-400 border-violet-900/50",
              !deployment && "bg-zinc-800 text-zinc-500 border-zinc-700"
            )}
          >
            <Globe size={16} />
          </div>
          <div>
            <p className="text-sm font-bold text-white font-sans">
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
            className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-zinc-950 hover:bg-emerald-400 transition-colors font-sans"
          >
            Open live page <ExternalLink size={12} />
          </a>
        )}
        {isPending && (
          <Link
            href="/dashboard/queue"
            className="flex items-center gap-1.5 rounded-lg bg-violet-500 px-3 py-1.5 text-xs font-bold text-zinc-950 hover:bg-violet-400 transition-colors font-sans"
          >
            <ClipboardCheck size={12} /> Review in Queue
          </Link>
        )}
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* DELIVERABLES GRID (2x2)                                           */}
      {/* ----------------------------------------------------------------- */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 font-sans">
        <PrimaryOutputCard run={run} onCopy={handleCopy} copiedKey={copiedKey} />
        <BrandVoiceCard run={run} onCopy={handleCopy} copiedKey={copiedKey} />
        <PlatformSyncCard run={run} />
        <CreativeAssetsCard run={run} onCopy={handleCopy} copiedKey={copiedKey} />
      </div>

      {/* Existing Page Audit Section */}
      {run.pinDownPageAudit && <ExistingPageAuditCard audit={run.pinDownPageAudit} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SUB-COMPONENTS
// ---------------------------------------------------------------------------
function Card({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="flex flex-col rounded-2xl border border-zinc-800/80 bg-transparent p-4 shadow-2xs font-sans backdrop-blur-xs">
      <div className="mb-3 flex items-center gap-2 border-b border-zinc-800/80 pb-2.5">
        <Icon size={14} className="text-zinc-400" />
        <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-300 font-sans">{title}</h3>
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
          <div className="max-h-48 overflow-auto rounded-xl border border-zinc-800/80 bg-black/40 p-3 font-mono">
            <pre className="whitespace-pre-wrap break-all text-[10px] leading-relaxed text-zinc-400">
              {run.pasteReadyHtml}
            </pre>
          </div>
          <button
            type="button"
            onClick={() => onCopy(run.pasteReadyHtml!, "html")}
            className="mt-2.5 flex w-fit items-center gap-1.5 rounded-lg border border-zinc-700/80 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-300 hover:bg-zinc-800 cursor-pointer transition-colors font-sans"
          >
            {copiedKey === "html" ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
            <span>{copiedKey === "html" ? "Copied HTML" : "Copy HTML Code"}</span>
          </button>
          {run.pasteReadyInstructions && (
            <p className="mt-2 text-[11px] leading-relaxed text-zinc-500 font-sans">{run.pasteReadyInstructions}</p>
          )}
        </>
      ) : run.confirmationPageUrl ? (
        <div className="overflow-hidden rounded-xl border border-zinc-800/80">
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
      <div className="space-y-2.5 font-sans">
        {tones.map(([label, t]) => (
          <div key={label}>
            <div className="mb-1 flex items-center justify-between text-[10px] text-zinc-500 font-mono">
              <span>{label}</span>
              <span>{t.score}/5</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800/80">
              <div
                className="h-full rounded-full bg-teal-400 transition-all"
                style={{ width: `${(t.score / 5) * 100}%` }}
              />
            </div>
            <p className="mt-0.5 text-[10px] text-zinc-500 font-sans">{t.note}</p>
          </div>
        ))}
      </div>

      {v.vocabulary.signature.length > 0 && (
        <div className="mt-3 border-t border-zinc-800/80 pt-2 font-sans">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] uppercase text-zinc-500 font-mono">Signature Vocabulary</span>
            <button
              type="button"
              onClick={() => onCopy(v.vocabulary.signature.join(", "), "vocab")}
              className="text-[10px] text-zinc-400 hover:text-white transition-colors cursor-pointer font-sans"
            >
              {copiedKey === "vocab" ? "Copied" : "Copy Tokens"}
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {v.vocabulary.signature.map((w) => (
              <span key={w} className="rounded-md bg-zinc-800/80 px-1.5 py-0.5 text-[10px] text-zinc-300 font-mono">
                {w}
              </span>
            ))}
          </div>
        </div>
      )}

      {v.banned_phrases.length > 0 && (
        <div className="mt-2.5 font-sans">
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
      <div className="space-y-2 text-xs font-sans">
        <Row label="Booking Platform" value={bookingPlatformLabel(stack.booking_platform)} />
        <Row label="Hosting Platform" value={hostingPlatformLabel(stack.hosting_platform)} />
        <div className="flex items-center justify-between border-t border-zinc-800/80 pt-2 font-sans">
          <span className="text-zinc-500 font-sans">Webhook Receiver Mode</span>
          <MutedBadge label={stack.webhook_receiver_mode ?? "none"} />
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
    <div className="flex items-center justify-between font-sans">
      <span className="text-zinc-500 font-sans">{label}</span>
      <span className="flex items-center gap-1 font-medium text-zinc-200 font-sans">
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
        <div className="mb-3 font-sans">
          <div className="mb-1.5 flex items-center justify-between font-sans">
            <span className="flex items-center gap-1 text-[10px] uppercase text-zinc-500 font-mono">
              <Megaphone size={10} /> Ad Creative Brief
            </span>
            <div className="flex items-center gap-2 font-sans">
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
            <div className="space-y-1.5 rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-2.5 text-[11px] text-zinc-300 font-sans">
              <p className="font-sans"><span className="text-zinc-500 font-sans">Hook:</span> {activeBrief.hook}</p>
              <p className="font-sans"><span className="text-zinc-500 font-sans">Angle:</span> {activeBrief.angle}</p>
              <p className="font-sans"><span className="text-zinc-500 font-sans">Format:</span> {activeBrief.suggestedFormat}</p>
              <p className="font-sans"><span className="text-zinc-500 font-sans">CTA:</span> {activeBrief.cta}</p>
            </div>
          )}
        </div>
      )}

      {scriptPack && (
        <div className="font-sans">
          <div className="mb-1.5 flex items-center justify-between font-sans">
            <span className="text-[10px] uppercase text-zinc-500 font-mono">Video Script Pack</span>
            <div className="flex items-center gap-2 font-sans">
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
            <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-2.5 text-[11px] text-zinc-400 font-sans">
              <p className="text-zinc-300 font-mono text-[10px]">
                {"targetLengthSeconds" in activeScript ? `${activeScript.targetLengthSeconds}s target length` : ""}
              </p>
              <p className="mt-1 line-clamp-3 font-sans">
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 font-sans">
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
    <div className="font-sans">
      <p className="mb-1.5 text-[10px] uppercase text-zinc-500 font-mono">{label}</p>
      <ul className="space-y-1.5 font-sans">
        {items.map((item, i) => (
          <li key={i} className="flex gap-1.5 text-[11px] leading-snug text-zinc-400 font-sans">
            <span className={cn("mt-1.5 h-1 w-1 shrink-0 rounded-full", dot)} />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}