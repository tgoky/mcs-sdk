"use client";

import { useState } from "react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { bookingPlatformLabel, hostingPlatformLabel } from "@/lib/copy";
import { Dropdown } from "@/components/ui/dropdown";
import { StatusPill } from "../_shared/status-pill";
import { EmptyState } from "../_shared/empty-state";
import type { PinDownDetail } from "../_shared/types";

const PILLAR_LABEL: Record<string, string> = {
  common_questions: "Common questions",
  deeper_questions: "Deeper questions",
  success_proof: "Success proof",
  objections: "Objections",
};

function useCopy() {
  const [copied, setCopied] = useState(false);
  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return { copied, copy };
}

export function PinDownView({ detail }: { detail: PinDownDetail }) {
  const { run } = detail;
  const deployment = run.confirmationPageDeployment;
  const isLive = deployment?.mode === "live";
  const isPasteReady = deployment?.mode === "paste_ready";
  const isPending = deployment?.mode === "pending_review";

  return (
    <div className="flex flex-col gap-3">
      {/* Hero deployment banner */}
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4",
          isLive && "border-emerald-900/50 bg-emerald-950/10",
          isPasteReady && "border-sky-900/50 bg-sky-950/10",
          isPending && "border-orange-900/50 bg-orange-950/10",
          !deployment && "border-zinc-800 bg-zinc-900/30"
        )}
      >
        <div className="flex items-center gap-3">
          <div className={cn(
            "flex h-9 w-9 items-center justify-center rounded-full",
            isLive && "bg-emerald-500/15 text-emerald-400",
            isPasteReady && "bg-sky-500/15 text-sky-400",
            isPending && "bg-orange-500/15 text-orange-400",
            !deployment && "bg-zinc-800 text-zinc-500"
          )}>
            <Globe size={16} />
          </div>
          <div>
            <p className="text-sm font-bold text-white">
              {isLive && "Published live"}
              {isPasteReady && "Paste-ready fallback"}
              {isPending && "Pending manual approval"}
              {deployment?.mode === "not_deployed" && "Not deployed"}
              {!deployment && "No deployment recorded"}
            </p>
            <p className="text-xs text-zinc-500">
              {deployment?.deployedVia ? `via ${hostingPlatformLabel(deployment.deployedVia)}` : "No deployment target recorded"}
              {deployment?.reason ? ` — ${deployment.reason}` : ""}
            </p>
          </div>
        </div>
        {isLive && run.confirmationPageUrl && (
          <a href={run.confirmationPageUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-zinc-950 hover:bg-emerald-400">
            Open live page <ExternalLink size={12} />
          </a>
        )}
      </div>

      {/* 2x2 grid */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <PrimaryOutputCard run={run} />
        <BrandVoiceCard run={run} />
        <PlatformSyncCard run={run} />
        <CreativeAssetsCard run={run} />
      </div>

      {run.pinDownPageAudit && <ExistingPageAuditCard audit={run.pinDownPageAudit} />}
    </div>
  );
}

function ExistingPageAuditCard({ audit }: { audit: NonNullable<PinDownDetail["run"]["pinDownPageAudit"]> }) {
  return (
    <Card title={`Existing page audit — ${audit.auditedUrl}`} icon={ScanSearch}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <AuditList label="Strengths" tone="success" items={audit.existingPageStrengths} />
        <AuditList label="Weaknesses" tone="danger" items={audit.existingPageWeaknesses} />
        <AuditList label="v1 improvements" tone="info" items={audit.v1Improvements} />
      </div>
    </Card>
  );
}

function AuditList({ label, tone, items }: { label: string; tone: "success" | "danger" | "info"; items: string[] }) {
  const dot = { success: "bg-emerald-400", danger: "bg-rose-400", info: "bg-sky-400" }[tone];
  return (
    <div>
      <p className="mb-1.5 text-[10px] uppercase text-zinc-500">{label}</p>
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

function Card({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="flex flex-col rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon size={14} className="text-zinc-400" />
        <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-300">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function PrimaryOutputCard({ run }: { run: PinDownDetail["run"] }) {
  const { copied, copy } = useCopy();
  const isPasteReady = run.confirmationPageDeployment?.mode === "paste_ready";

  return (
    <Card title="Confirmation page output" icon={Code2}>
      {isPasteReady && run.pasteReadyHtml ? (
        <>
          <div className="max-h-48 overflow-auto rounded-xl border border-zinc-800 bg-black/40 p-3">
            <pre className="whitespace-pre-wrap break-all text-[10px] leading-relaxed text-zinc-400">{run.pasteReadyHtml}</pre>
          </div>
          <button
            onClick={() => copy(run.pasteReadyHtml!)}
            className="mt-2.5 flex w-fit items-center gap-1.5 rounded-lg border border-zinc-700 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-300 hover:bg-zinc-800 cursor-pointer"
          >
            {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
            {copied ? "Copied" : "Copy HTML"}
          </button>
          {run.pasteReadyInstructions && (
            <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">{run.pasteReadyInstructions}</p>
          )}
        </>
      ) : run.confirmationPageUrl ? (
        <div className="overflow-hidden rounded-xl border border-zinc-800">
          <iframe src={run.confirmationPageUrl} className="h-48 w-full bg-white" sandbox="allow-same-origin" title="Confirmation page preview" />
        </div>
      ) : (
        <EmptyState icon={Code2} title="No output yet" description="No confirmation page URL or paste-ready HTML has been recorded for this engagement." />
      )}
    </Card>
  );
}

function BrandVoiceCard({ run }: { run: PinDownDetail["run"] }) {
  const v = run.brandVoiceProfile;
  if (!v) return <Card title="Brand voice & positioning" icon={Palette}><EmptyState icon={Palette} title="No voice profile yet" description="Brand voice extraction hasn't run for this engagement." /></Card>;

  const tones: Array<[string, { score: number; note: string }]> = [
    ["Formal ↔ Casual", v.tone.formal_casual],
    ["Technical ↔ Plain", v.tone.technical_plain],
    ["Warm ↔ Neutral", v.tone.warm_neutral],
  ];

  return (
    <Card title="Brand voice & positioning" icon={Palette}>
      <div className="space-y-2.5">
        {tones.map(([label, t]) => (
          <div key={label}>
            <div className="mb-1 flex items-center justify-between text-[10px] text-zinc-500">
              <span>{label}</span><span className="font-mono">{t.score}/5</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
              <div className="h-full rounded-full bg-gold" style={{ width: `${(t.score / 5) * 100}%` }} />
            </div>
            <p className="mt-0.5 text-[10px] text-zinc-600">{t.note}</p>
          </div>
        ))}
      </div>
      {v.vocabulary.signature.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-[10px] uppercase text-zinc-500">Signature vocabulary</p>
          <div className="flex flex-wrap gap-1">
            {v.vocabulary.signature.map((w) => (
              <span key={w} className="rounded-md bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-300">{w}</span>
            ))}
          </div>
        </div>
      )}
      {v.banned_phrases.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 flex items-center gap-1 text-[10px] uppercase text-zinc-500"><AlertCircle size={10} /> Banned phrases</p>
          <div className="flex flex-wrap gap-1">
            {v.banned_phrases.map((b) => (
              <span key={b.phrase} className="rounded-md bg-rose-950/40 px-1.5 py-0.5 text-[10px] text-rose-400">{b.phrase}</span>
            ))}
          </div>
        </div>
      )}
      {v.source_path === "default" && (
        <p className="mt-3 text-[10px] italic text-zinc-600">Using neutral default — supplied voice corpus was too short ({v.corpus_word_count} words) to extract a real profile.</p>
      )}
    </Card>
  );
}

function PlatformSyncCard({ run }: { run: PinDownDetail["run"] }) {
  const stack = run.stack;
  if (!stack) return <Card title="Platform sync" icon={Webhook}><EmptyState icon={Webhook} title="No stack configured" description="This engagement has no platform stack recorded yet." /></Card>;

  return (
    <Card title="Platform sync" icon={Webhook}>
      <div className="space-y-2 text-xs">
        <Row label="Booking platform" value={bookingPlatformLabel(stack.booking_platform)} />
        <Row label="Hosting platform" value={hostingPlatformLabel(stack.hosting_platform)} />
        <div className="flex items-center justify-between border-t border-zinc-900 pt-2">
          <span className="text-zinc-500">Webhook mode</span>
          <StatusPill tone={stack.webhook_receiver_mode === "webhook" ? "success" : stack.webhook_receiver_mode === "polling" ? "info" : "neutral"}>
            {stack.webhook_receiver_mode ?? "none"}
          </StatusPill>
        </div>
        {stack.webhook_last_received_at && (
          <Row label="Last webhook received" value={new Date(stack.webhook_last_received_at).toLocaleString()} icon={Clock} />
        )}
        {stack.webhook_last_error && (
          <p className="rounded-lg bg-rose-950/30 px-2 py-1.5 text-[10px] text-rose-400">{stack.webhook_last_error}</p>
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

function CreativeAssetsCard({ run }: { run: PinDownDetail["run"] }) {
  const briefs = run.adCreativeBriefs?.briefs ?? [];
  const scriptPack = run.pinDownScriptPack;
  const [briefKey, setBriefKey] = useState(briefs[0]?.id ?? "");
  const [scriptKey, setScriptKey] = useState<string>("hero");

  const activeBrief = briefs.find((b) => b.id === briefKey);
  const breakouts = scriptPack?.breakoutScripts ?? [];
  const activeScript = scriptKey === "hero" ? scriptPack?.heroScript : breakouts.find((s) => s.id === scriptKey);

  if (briefs.length === 0 && !scriptPack) {
    return <Card title="Generated creative assets" icon={Film}><EmptyState icon={Film} title="No creative assets yet" description="Ad creative briefs and the video script pack haven't been generated for this engagement." /></Card>;
  }

  return (
    <Card title="Generated creative assets" icon={Film}>
      {briefs.length > 0 && (
        <div className="mb-3">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1 text-[10px] uppercase text-zinc-500"><Megaphone size={10} /> Ad creative brief</span>
            <Dropdown
              variant="field"
              items={briefs.map((b) => ({ key: b.id, label: PILLAR_LABEL[b.pillar] ?? b.pillar }))}
              selectedKey={briefKey}
              onSelect={setBriefKey}
              triggerClassName="w-44 py-1"
            />
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
            <span className="text-[10px] uppercase text-zinc-500">Video script</span>
            <Dropdown
              variant="field"
              items={[{ key: "hero", label: scriptPack.heroScript.title }, ...breakouts.map((s) => ({ key: s.id, label: s.title }))]}
              selectedKey={scriptKey}
              onSelect={setScriptKey}
              triggerClassName="w-44 py-1"
            />
          </div>
          {activeScript && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-2.5 text-[11px] text-zinc-400">
              <p className="text-zinc-300">{"targetLengthSeconds" in activeScript ? `${activeScript.targetLengthSeconds}s target` : ""}</p>
              <p className="mt-1 line-clamp-4">{"chapters" in activeScript ? activeScript.chapters[0]?.script : activeScript.script}</p>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
