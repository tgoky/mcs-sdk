"use client";

// src/components/product-setup/tool-avatar.tsx
//
// One tool as a round logo. Clicking it grows a small card out of the
// circle with whatever connecting it takes from here:
//   - already connected for this client: which account, and a way to swap
//     or disconnect it;
//   - saved elsewhere in the workspace: one click to reuse (Jev marks the
//     one that looks like this client's), or connect another account;
//   - nothing yet: "Sign in with X" when Composio supports it, with "Use an
//     API key instead" underneath; otherwise just the key field;
//   - a tool that needs one more value beside the key (GoHighLevel's
//     Location ID, ActiveCampaign's account URL): asked next to the key with
//     why it's needed, or on its own once connected, and shown when known.
// Clicking away or Escape shrinks it back into the circle.

import { useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, ArrowUpRight, Check, KeyRound, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlatformLogo } from "@/components/platform-logo";
import type { SetupTool } from "@/lib/showtime-setup/catalog";
import type { ToolState } from "@/lib/showtime-setup/types";
import { AnchoredCard } from "./anchored-card";
import { cn } from "@/lib/utils";

export interface ToolActions {
  useSaved: (tool: SetupTool, vaultId: string) => Promise<string | null>;
  connectKey: (tool: SetupTool, value: string, extra: Record<string, string>) => Promise<string | null>;
  signIn: (tool: SetupTool) => Promise<string | null>;
  disconnect: (tool: SetupTool) => Promise<string | null>;
  /** Pick a tool that has nothing to connect (Any website, Lovable). */
  choose: (tool: SetupTool) => void;
  /** Save the tool's extra value on the connection this client already has.
   * Screens without it don't ask for the extra value once connected. */
  setExtra?: (tool: SetupTool, extras: Record<string, string>) => Promise<string | null>;
}

/** Connected, but still missing the one extra value the tool needs. */
function missingExtra(tool: SetupTool, state: ToolState | undefined, actions: ToolActions): boolean {
  return Boolean(tool.extraField && actions.setExtra && state?.linked && state.extra && !state.extra.value);
}

export function ToolAvatar({
  tool,
  state,
  selected,
  buyer,
  actions,
  size = 48,
}: {
  tool: SetupTool;
  state: ToolState | undefined;
  /** This tool is the one chosen for its group. */
  selected: boolean;
  buyer: string;
  actions: ToolActions;
  size?: number;
}) {
  const [open, setOpen] = useState(false);
  const linked = Boolean(state?.linked);
  const on = selected && (linked || !tool.needsKey);
  const mismatch = linked && state?.accountCheck && !state.accountCheck.matches;
  const needsExtra = missingExtra(tool, state, actions);

  return (
    <AnchoredCard
      open={open}
      onOpenChange={setOpen}
      label={`${tool.label} connection`}
      anchor={(props) => (
        <button
          type="button"
          {...props}
          className="group relative flex flex-col items-center gap-1.5 outline-none cursor-pointer"
          aria-label={`${tool.label}${on ? ", connected" : ""}`}
        >
          <motion.span
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.94 }}
            transition={{ type: "spring", stiffness: 500, damping: 28 }}
            className={cn(
              "relative flex items-center justify-center rounded-full bg-white transition-shadow",
              "shadow-elevation-1 ring-1 ring-black/10 dark:ring-white/10 group-hover:shadow-elevation-2",
              "group-focus-visible:ring-2 group-focus-visible:ring-[var(--ring)]",
              on && "ring-2 ring-[var(--ink)] dark:ring-[var(--ink)]",
              open && "shadow-elevation-2"
            )}
            style={{ width: size, height: size }}
          >
            <PlatformLogo provider={tool.provider} size={Math.round(size * 0.52)} monogram={tool.label} />
            {state?.seenOnSite && !on && (
              <span
                className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background bg-[var(--text-prefill-accent)]"
                title="Seen on your website"
              />
            )}
            <AnimatePresence>
              {on && (
                <motion.span
                  key="check"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 600, damping: 20 }}
                  className={cn(
                    "absolute -bottom-0.5 -right-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-background",
                    mismatch || needsExtra ? "bg-[var(--error)] text-white" : "bg-[var(--ink)] text-[var(--ink-foreground)]"
                  )}
                  title={needsExtra ? `Needs its ${tool.extraField?.label}` : undefined}
                >
                  {mismatch || needsExtra ? <AlertTriangle className="h-2.5 w-2.5" strokeWidth={3} /> : <Check className="h-2.5 w-2.5" strokeWidth={3.5} />}
                </motion.span>
              )}
            </AnimatePresence>
          </motion.span>
          <span className={cn("max-w-[72px] truncate text-[11px] leading-none", on ? "text-[var(--text-primary)] font-medium" : "text-[var(--text-muted)]")}>
            {tool.label}
          </span>
        </button>
      )}
    >
      <ToolCard tool={tool} state={state} selected={selected} buyer={buyer} actions={actions} close={() => setOpen(false)} />
    </AnchoredCard>
  );
}

function ToolCard({
  tool,
  state,
  selected,
  buyer,
  actions,
  close,
}: {
  tool: SetupTool;
  state: ToolState | undefined;
  selected: boolean;
  buyer: string;
  actions: ToolActions;
  close: () => void;
}) {
  const linked = Boolean(state?.linked);
  const saved = state?.saved ?? [];
  const [mode, setMode] = useState<"main" | "connect">(linked || saved.length > 0 ? "main" : "connect");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<string | null>, closeAfter = true) {
    setBusy(key);
    setError(null);
    const err = await fn();
    setBusy(null);
    if (err) setError(err);
    else if (closeAfter) close();
  }

  return (
    <div>
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-black/10 dark:ring-white/10">
          <PlatformLogo provider={tool.provider} size={18} monogram={tool.label} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight">{tool.label}</p>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            {linked ? (
              <span className="inline-flex items-center gap-1 text-[var(--text-secondary)]">
                <Check className="h-3 w-3" strokeWidth={3} /> Connected for {buyer}
              </span>
            ) : state?.seenOnSite ? (
              "We spotted this on your website"
            ) : (
              TOOL_GROUP_BLURB[tool.group]
            )}
          </p>
        </div>
      </div>

      {linked && state?.accountCheck && !state.accountCheck.matches && (
        <p className="mx-4 mb-3 flex gap-2 rounded-lg bg-[color-mix(in_oklch,var(--error)_10%,transparent)] px-3 py-2 text-xs leading-relaxed text-[var(--error)]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          This account looks like it belongs to a different business. Check it before Showtime sends anything.
        </p>
      )}

      {linked && tool.extraField && state?.extra && actions.setExtra && mode === "main" && (
        <ExtraSection tool={tool} extra={state.extra} busy={busy} onRun={run} actions={actions} />
      )}

      {!tool.needsKey ? (
        <div className="space-y-3 px-4 pb-4">
          <p className="text-xs leading-relaxed text-[var(--text-secondary)]">{tool.noKeyNote}</p>
          <Button
            className="w-full"
            size="lg"
            onClick={() => {
              actions.choose(tool);
              close();
            }}
            disabled={selected}
          >
            {selected ? "In use" : `Use ${tool.label}`}
          </Button>
        </div>
      ) : mode === "main" ? (
        <div className="pb-2">
          {linked ? (
            <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
              {!selected && (
                <Button
                  size="sm"
                  onClick={() => {
                    actions.choose(tool);
                    close();
                  }}
                >
                  Use {tool.label}
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setMode("connect")}>
                Use a different account
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-[var(--text-muted)] hover:text-[var(--error)]"
                onClick={() => run("disconnect", () => actions.disconnect(tool))}
                disabled={busy !== null}
              >
                {busy === "disconnect" ? <Loader2 className="animate-spin" /> : null}
                Disconnect
              </Button>
            </div>
          ) : null}

          {saved.length > 0 && (
            <>
              <p className="px-4 pb-1.5 text-[11px] font-medium text-[var(--text-muted)]">
                {linked ? "Other saved accounts" : "Already connected in your workspace"}
              </p>
              <ul className="px-2">
                {saved.map((s) => (
                  <li key={s.vaultId}>
                    <button
                      type="button"
                      // Stays open when the extra value may still be needed,
                      // so it can be asked right here (or shown, once found).
                      onClick={() => run(s.vaultId, () => actions.useSaved(tool, s.vaultId), !(tool.extraField && actions.setExtra && !state?.extra?.value))}
                      disabled={busy !== null}
                      className="group/row flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-[var(--accent-dim)] disabled:opacity-60 cursor-pointer"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-medium">{s.label}</span>
                          {s.bestMatch && saved.length > 1 && (
                            <span className="shrink-0 rounded-full bg-[var(--surface-prefill)] px-1.5 py-px text-[10px] font-semibold text-[var(--text-prefill-accent)] ring-1 ring-inset ring-[var(--border-prefill)]">
                              Best match
                            </span>
                          )}
                        </span>
                        <span className="block text-xs text-[var(--text-muted)]">
                          {s.usedBy > 0 ? `Used by ${s.usedBy} client${s.usedBy === 1 ? "" : "s"}` : "Not used by any client yet"}
                          {s.healthStatus === "invalid" ? " · needs reconnecting" : ""}
                        </span>
                      </span>
                      {busy === s.vaultId ? (
                        <Loader2 className="h-4 w-4 animate-spin text-[var(--text-muted)]" />
                      ) : (
                        <span className="text-xs font-semibold text-[var(--text-muted)] opacity-0 transition-opacity group-hover/row:opacity-100">
                          Use
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {!linked && (
            <div className="mt-1 border-t px-4 pt-2">
              <button
                type="button"
                onClick={() => setMode("connect")}
                className="flex w-full items-center justify-between py-1.5 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                Connect another account <ArrowUpRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {error && <p className="px-4 pb-2 text-xs text-[var(--error)]">{error}</p>}
        </div>
      ) : (
        <ConnectForm
          tool={tool}
          knownExtra={state?.extra?.value ?? null}
          busy={busy}
          error={error}
          onRun={run}
          actions={actions}
          onBack={linked || saved.length > 0 ? () => setMode("main") : undefined}
        />
      )}
    </div>
  );
}

const TOOL_GROUP_BLURB: Record<SetupTool["group"], string> = {
  booking: "Brings in every booked call",
  email: "Sends follow-ups and recovery emails",
  hosting: "Hosts the confirmation page",
  sending: "Sends your cold email",
};

/** The extra value on a connected tool: shown when known, asked when not. */
function ExtraSection({
  tool,
  extra,
  busy,
  onRun,
  actions,
}: {
  tool: SetupTool;
  extra: NonNullable<ToolState["extra"]>;
  busy: string | null;
  onRun: (key: string, fn: () => Promise<string | null>, closeAfter?: boolean) => Promise<void>;
  actions: ToolActions;
}) {
  const field = tool.extraField!;
  const [editing, setEditing] = useState(!extra.value);
  const [value, setValue] = useState("");

  if (!editing && extra.value) {
    return (
      <div className="mx-4 mb-3 flex items-center gap-2 rounded-lg bg-[var(--accent-dim)] px-3 py-2 text-xs">
        <span className="text-[var(--text-muted)]">{field.label}</span>
        <span className="min-w-0 flex-1 truncate font-medium text-[var(--text-primary)]" title={extra.value}>
          {extra.display ?? extra.value}
        </span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-1 font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
        >
          <Pencil className="h-3 w-3" /> Change
        </button>
      </div>
    );
  }

  return (
    <form
      className="mx-4 mb-3 space-y-2 rounded-lg border px-3 py-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) onRun("extra", () => actions.setExtra!(tool, { [field.key]: value.trim() }));
      }}
    >
      <p className="text-xs font-medium text-[var(--text-primary)]">{extra.value ? `Change the ${field.label}` : `One more thing: the ${field.label}`}</p>
      <p className="text-[11px] leading-relaxed text-[var(--text-secondary)]">{field.why}</p>
      <div className="flex gap-2">
        <input
          autoFocus
          type={field.inputType}
          spellCheck={false}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={field.placeholder}
          aria-label={field.label}
          className="h-9 min-w-0 flex-1 rounded-lg border bg-background px-3 text-[13px] outline-none transition-shadow placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-[var(--ring)]/40"
        />
        <Button type="submit" size="sm" className="h-9" disabled={busy !== null || !value.trim()}>
          {busy === "extra" ? <Loader2 className="animate-spin" /> : "Save"}
        </Button>
      </div>
      <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">Find it in {field.howTo}.</p>
      {extra.value && (
        <button type="button" onClick={() => setEditing(false)} className="text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer">
          Keep {extra.display ?? extra.value}
        </button>
      )}
    </form>
  );
}

function ConnectForm({
  tool,
  knownExtra,
  busy,
  error,
  onRun,
  actions,
  onBack,
}: {
  tool: SetupTool;
  /** The extra value this client already has; the field can stay empty then. */
  knownExtra: string | null;
  busy: string | null;
  error: string | null;
  onRun: (key: string, fn: () => Promise<string | null>, closeAfter?: boolean) => Promise<void>;
  actions: ToolActions;
  onBack?: () => void;
}) {
  const [useKey, setUseKey] = useState(!tool.composio);
  const [value, setValue] = useState("");
  const [extra, setExtra] = useState("");
  const extraRequired = Boolean(tool.extraField && !knownExtra);
  const ready = Boolean(value.trim()) && (!extraRequired || Boolean(extra.trim()));

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!ready) return;
    const extras: Record<string, string> = tool.extraField && extra.trim() ? { [tool.extraField.key]: extra.trim() } : {};
    onRun("key", () => actions.connectKey(tool, value.trim(), extras));
  }

  return (
    <div className="space-y-3 px-4 pb-4">
      {!useKey ? (
        <>
          <Button className="w-full" size="lg" onClick={() => onRun("signin", () => actions.signIn(tool), false)} disabled={busy !== null}>
            {busy === "signin" ? <Loader2 className="animate-spin" /> : null}
            Sign in with {tool.label}
          </Button>
          <button
            type="button"
            onClick={() => setUseKey(true)}
            className="flex w-full items-center justify-center gap-1.5 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <KeyRound className="h-3 w-3" /> Use an API key instead
          </button>
        </>
      ) : (
        <form onSubmit={submit} className="space-y-2.5">
          <input
            autoFocus
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={tool.keyPlaceholder ?? "API key"}
            className="h-10 w-full rounded-lg border bg-background px-3 font-mono text-[13px] outline-none transition-shadow placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-[var(--ring)]/40"
          />
          {tool.keyHowTo && <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">Find it in {tool.keyHowTo}.</p>}
          {tool.extraField && (
            <div className="space-y-1.5 pt-1">
              <input
                type={tool.extraField.inputType}
                spellCheck={false}
                value={extra}
                onChange={(e) => setExtra(e.target.value)}
                placeholder={knownExtra ? `${tool.extraField.label}: ${knownExtra} (leave empty to keep)` : tool.extraField.placeholder}
                aria-label={tool.extraField.label}
                className="h-10 w-full rounded-lg border bg-background px-3 text-[13px] outline-none transition-shadow placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-[var(--ring)]/40"
              />
              {!knownExtra && (
                <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
                  {tool.extraField.why} Find it in {tool.extraField.howTo}.
                </p>
              )}
            </div>
          )}
          <Button type="submit" className="w-full" size="lg" disabled={busy !== null || !ready}>
            {busy === "key" ? <Loader2 className="animate-spin" /> : null}
            {busy === "key" ? "Checking…" : "Connect"}
          </Button>
          {tool.composio && (
            <button
              type="button"
              onClick={() => setUseKey(false)}
              className="w-full text-center text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              Sign in with {tool.label} instead
            </button>
          )}
        </form>
      )}
      {error && <p className="text-xs leading-relaxed text-[var(--error)]">{error}</p>}
      {onBack && (
        <button type="button" onClick={onBack} className="text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer">
          ← Back
        </button>
      )}
    </div>
  );
}
