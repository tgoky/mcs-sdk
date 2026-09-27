"use client";

// src/components/skill-settings/skill-settings-panel.tsx
//
// One skill's Configure (lib/skill-settings): what it does, the tools it
// runs on as logos to pick and connect right here (sign in, a saved
// account, or a key, through the same connect route setup uses), what
// each tool still needs (a Twilio number read from the account, a Slack
// channel, an address to paste, a signing secret), and the knobs that
// change how it behaves. One Save.
//
// Signing in leaves the page; the panel keeps what was typed and opens
// again when the person comes back (see SkillConfigureMenu).

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Check, ChevronDown, Copy, Eye, EyeOff, Loader2, NotebookPen, Plus, Search, Star, Tag, X, Ban } from "lucide-react";
import { Switch } from "@/components/product-setup/skill-switch";
import { ToolAvatar, type ToolActions } from "@/components/product-setup/tool-avatar";
import { AnchoredCard } from "@/components/product-setup/anchored-card";
import { PlatformLogo } from "@/components/platform-logo";
import { cn } from "@/lib/utils";
import { fieldKey, isShown, isValueless, pickSource, settingsFor, toShown, type SettingField, type SettingValue, type SettingValues, type ToolChoice, type Touchset } from "@/lib/skill-settings/schema";
import { PROVIDER_BY_RESOURCE } from "@/lib/stack-option-providers";
import { LeadLists } from "@/components/product-setup/cold-open-setup";
import type { RepGoogleListing } from "@/models/schema";
import type { SkillSettingsView } from "@/lib/skill-settings/server";
import type { SetupTool } from "@/lib/showtime-setup/catalog";

const inputCls =
  "w-full rounded-md border border-zinc-200 bg-white/70 px-2.5 text-[13px] text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-white/25";

/** Kept across a sign-in redirect: which panel to open again, and its draft. */
export const REOPEN_KEY = "skill-settings:reopen";

function isSettingsView(v: unknown): v is SkillSettingsView {
  const o = v as Partial<SkillSettingsView> | null;
  return Boolean(o && typeof o.name === "string" && o.values && Array.isArray(o.facts) && Array.isArray(o.tools));
}

function shownValues(fields: SettingField[], values: SettingValues): SettingValues {
  return Object.fromEntries(fields.filter((f) => !isValueless(f) && f.kind !== "secret").map((f) => [fieldKey(f), toShown(f, values[fieldKey(f)] ?? null)]));
}

async function post(url: string, body: unknown): Promise<string | null> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    return res.ok ? null : (json.error ?? "Something went wrong. Try again.");
  } catch {
    return "Couldn't reach the server. Check the connection and try again.";
  }
}

export function SkillSettingsPanel({
  engagementId,
  skillId,
  onClose,
  onSaved,
}: {
  engagementId: string;
  skillId: string;
  onClose: () => void;
  /** After a save went through; `notice` says what it set off, if anything. */
  onSaved?: (notice?: string) => void;
}) {
  const spec = settingsFor(skillId);
  const fields = useMemo(() => spec?.fields ?? [], [spec]);
  const url = `/api/engagements/${encodeURIComponent(engagementId)}/skills/${encodeURIComponent(skillId)}/settings`;
  const pathname = usePathname();

  const [view, setView] = useState<SkillSettingsView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<SettingValues>({});
  const [saved, setSaved] = useState<SettingValues>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ text: string; field?: string } | null>(null);

  const load = useCallback(async (): Promise<SkillSettingsView | null> => {
    const res = await fetch(url, { cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !isSettingsView(body)) throw new Error((body as { error?: string }).error ?? "Couldn't load these settings.");
    return body;
  }, [url]);

  useEffect(() => {
    let live = true;
    load()
      .then((body) => {
        if (!live || !body) return;
        setView(body);
        const shown = shownValues(fields, body.values);
        setSaved(shown);
        // Back from signing in: what was typed before leaving comes back.
        let kept: SettingValues | null = null;
        try {
          const raw = sessionStorage.getItem(REOPEN_KEY);
          const parsed = raw ? (JSON.parse(raw) as { engagementId?: string; skillId?: string; draft?: SettingValues }) : null;
          if (parsed?.engagementId === engagementId && parsed.skillId === skillId && parsed.draft) kept = parsed.draft;
          if (parsed?.skillId === skillId) sessionStorage.removeItem(REOPEN_KEY);
        } catch {
          // Nothing kept.
        }
        setDraft(kept ? { ...shown, ...kept } : shown);
      })
      .catch((e) => live && setLoadError(e instanceof Error ? e.message : "Couldn't load these settings."));
    return () => {
      live = false;
    };
  }, [load, fields, engagementId, skillId]);

  /** Tool states and loaded choices change after a connection; the draft doesn't. */
  const refresh = useCallback(async () => {
    try {
      const body = await load();
      if (body) setView(body);
    } catch {
      // Keep what's shown.
    }
  }, [load]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const set = (key: string, value: SettingValue) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setError(null);
  };

  const connectUrl = `/api/engagements/${encodeURIComponent(engagementId)}/setup/showtime/connect`;
  /** Connecting from a tool's card also picks it for the row it's in. */
  const actionsFor = (onChoose: (tool: SetupTool) => void): ToolActions => ({
    useSaved: async (tool, vaultId) => {
      const err = await post(connectUrl, { provider: tool.provider, vaultId });
      if (err) return err;
      onChoose(tool);
      await refresh();
      return null;
    },
    connectKey: async (tool, value, extra) => {
      const err = await post(connectUrl, { provider: tool.provider, value, ...extra });
      if (err) return err;
      onChoose(tool);
      await refresh();
      return null;
    },
    signIn: async (tool) => {
      try {
        sessionStorage.setItem(REOPEN_KEY, JSON.stringify({ engagementId, skillId, draft }));
      } catch {
        // Private mode: the panel opens again empty-handed.
      }
      try {
        const res = await fetch("/api/composio/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider: tool.provider, returnTo: pathname, engagementId }),
        });
        const json = (await res.json().catch(() => ({}))) as { redirectUrl?: string; error?: string };
        if (!res.ok || !json.redirectUrl) return json.error ?? `Couldn't start signing in to ${tool.label}.`;
        window.location.assign(json.redirectUrl);
        return null;
      } catch {
        return `Couldn't start signing in to ${tool.label}.`;
      }
    },
    disconnect: async (tool) => {
      const err = await post(connectUrl, { provider: tool.provider, disconnect: true });
      if (err) return err;
      await refresh();
      return null;
    },
    choose: onChoose,
    setExtra: async (tool, extras) => {
      const err = await post(connectUrl, { provider: tool.provider, ...extras });
      if (err) return err;
      await refresh();
      return null;
    },
  });

  async function save() {
    setSaving(true);
    setError(null);
    try {
      // Only what's shown is sent; hidden rows keep what's stored.
      const body = Object.fromEntries(fields.filter((f) => !isValueless(f) && isShown(f, draft, fields) && fieldKey(f) in draft).map((f) => [fieldKey(f), draft[fieldKey(f)]]));
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; field?: string; notice?: string };
      if (!res.ok || !json.ok) {
        setError({ text: json.error ?? "Couldn't save.", field: json.field });
        return;
      }
      const kept = Object.fromEntries(Object.entries(draft).filter(([k]) => !k.startsWith("secret:")));
      setSaved(kept);
      setDraft(kept);
      onSaved?.(json.notice);
    } catch {
      setError({ text: "Couldn't save. Check your connection and try again." });
    } finally {
      setSaving(false);
    }
  }

  if (loadError) return <p className="p-4 text-[13px] text-rose-600 dark:text-rose-400">{loadError}</p>;
  if (!view) {
    return (
      <div className="flex items-center gap-2 p-4 text-[13px] text-zinc-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading settings…
      </div>
    );
  }

  const shown = fields.filter((f) => isShown(f, draft, fields));
  const editable = fields.some((f) => !isValueless(f)) && !view.blocked;

  return (
    <div className="space-y-4 p-4">
      <header className="space-y-1">
        <p className="text-[15px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">{view.name}</p>
        <p className="line-clamp-2 text-[12.5px] leading-relaxed text-zinc-500 dark:text-zinc-400">{view.description}</p>
      </header>

      {view.alert && <AlertRow alert={view.alert} onDone={refresh} />}

      {view.blocked ? (
        <p className="text-[13px] text-zinc-600 dark:text-zinc-300">{view.blocked}</p>
      ) : fields.length > 0 ? (
        <div className="space-y-4">
          {shown.map((f) => (
            <FieldRow
              key={fieldKey(f)}
              field={f}
              value={draft[fieldKey(f)] ?? null}
              draft={draft}
              onChange={(v) => set(fieldKey(f), v)}
              view={view}
              engagementId={engagementId}
              actionsFor={actionsFor}
              error={error?.field === fieldKey(f) ? error.text : null}
            />
          ))}
        </div>
      ) : (
        <p className="text-[13px] text-zinc-600 dark:text-zinc-300">It runs on its own; there&apos;s nothing to set.</p>
      )}

      {view.facts.length > 0 && (
        <dl className="space-y-1.5 border-t border-zinc-200/70 pt-3 text-[12.5px] dark:border-white/10">
          {view.facts.map((fact) => (
            <div key={fact.label} className="flex items-baseline justify-between gap-4">
              <dt className="shrink-0 text-zinc-500 dark:text-zinc-400">{fact.label}</dt>
              <dd className="min-w-0 text-right text-zinc-800 dark:text-zinc-200">{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {error && (!error.field || !shown.some((f) => fieldKey(f) === error.field)) && <p className="text-[12.5px] text-rose-600 dark:text-rose-400">{error.text}</p>}

      <footer className="flex items-center justify-end gap-2 border-t border-zinc-200/70 pt-3 dark:border-white/10">
        <button type="button" onClick={onClose} className="h-8 rounded-md px-3 text-[13px] text-zinc-600 transition-colors hover:bg-zinc-900/5 dark:text-zinc-300 dark:hover:bg-white/5 cursor-pointer">
          {editable ? "Cancel" : "Close"}
        </button>
        {editable && (
          <button
            type="button"
            onClick={save}
            disabled={!dirty || saving}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-zinc-900 px-3 text-[13px] font-medium text-white transition-opacity disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 cursor-pointer disabled:cursor-default"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save
          </button>
        )}
      </footer>
    </div>
  );
}

function AlertRow({ alert, onDone }: { alert: NonNullable<SkillSettingsView["alert"]>; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="space-y-2 rounded-md border border-amber-300/60 bg-amber-50/70 px-3 py-2.5 text-[12.5px] leading-relaxed text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/[0.06] dark:text-amber-200">
      <p>{alert.text}</p>
      {err && <p className="text-rose-700 dark:text-rose-300">{err}</p>}
      {alert.action && (
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setErr(null);
            const e = await post(alert.action!.endpoint, {});
            setBusy(false);
            if (e) setErr(e);
            else onDone();
          }}
          className="inline-flex h-7 items-center gap-1.5 rounded-md border border-amber-400/70 px-2.5 font-medium hover:bg-amber-100 disabled:opacity-50 dark:border-amber-300/30 dark:hover:bg-amber-300/10 cursor-pointer"
        >
          {busy && <Loader2 className="h-3 w-3 animate-spin" />}
          {alert.action.label}
        </button>
      )}
    </div>
  );
}

interface RowProps {
  field: SettingField;
  value: SettingValue;
  draft: SettingValues;
  onChange: (v: SettingValue) => void;
  view: SkillSettingsView;
  engagementId: string;
  actionsFor: (onChoose: (tool: SetupTool) => void) => ToolActions;
  error: string | null;
}

function FieldRow(p: RowProps) {
  const { field: f, view, error } = p;
  const locked = f.lockedIf && view.context[f.lockedIf.path] === f.lockedIf.equals ? f.lockedIf : null;
  const help = locked ? locked.reason : f.help;

  if (f.kind === "toggle") {
    return (
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">{f.label}</p>
          {help && <p className="mt-0.5 text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">{help}</p>}
          {error && <p className="mt-0.5 text-[12px] text-rose-600 dark:text-rose-400">{error}</p>}
        </div>
        <div className={cn(locked && "pointer-events-none opacity-50")}>
          <Switch on={locked ? Boolean(locked.value) : p.value === true} onChange={(on) => p.onChange(on)} label={f.label} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <p className="text-[12.5px] font-medium text-zinc-700 dark:text-zinc-300">{f.label}</p>
      <Control {...p} />
      {help && <p className="text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">{help}</p>}
      {error && <p className="text-[12px] text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
}

function Control(p: RowProps) {
  const { field: f, value, onChange, view } = p;
  switch (f.kind) {
    case "tool":
      return <ToolRow {...p} field={f} />;
    case "connect":
      return (
        <div className="flex flex-wrap gap-4">
          {f.tools.map((tool) => {
            const state = view.tools.find((t) => t.provider === tool.provider);
            return <ToolAvatar key={tool.provider} tool={tool} state={state} selected={Boolean(state?.linked)} buyer={view.buyer} actions={p.actionsFor(() => undefined)} size={40} />;
          })}
        </div>
      );
    case "pick":
      return <LivePick {...p} field={f} />;
    case "copy":
      return <CopyValue value={view.copies[f.from] ?? null} secret={f.secret} />;
    case "pairs":
      return <PairsEditor field={f} value={value} onChange={onChange} />;
    case "sequences":
      return <SequencesEditor field={f} value={value} onChange={onChange} />;
    case "leadLists": {
      const icps = (view.mapKeys[fieldKey(f)] ?? []).map((k) => ({ slug: k.value, label: k.label }));
      return (
        <ol className="space-y-1">
          <LeadLists engagementId={p.engagementId} icps={icps} />
        </ol>
      );
    }
    case "listing":
      return <ListingPicker engagementId={p.engagementId} value={value} onChange={onChange} />;
    case "secret": {
      const isSet = view.secretsSet.includes(fieldKey(f));
      return (
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={isSet ? "Saved. Paste a new one to replace it." : (f.placeholder ?? "Paste it here")}
          aria-label={f.label}
          className={cn(inputCls, "h-8 font-mono")}
        />
      );
    }
    case "map": {
      const keys = view.mapKeys[fieldKey(f)] ?? [];
      const campaigns = view.options[fieldKey(f)] ?? [];
      const map = (value && typeof value === "object" && !Array.isArray(value) ? value : {}) as Record<string, string>;
      if (keys.length === 0) return <p className="text-[12.5px] text-zinc-500">No customer types yet.</p>;
      if (campaigns.length === 0) return <p className="text-[12.5px] text-zinc-500">No campaigns found in the sending tool yet. Create one there, then open this again.</p>;
      return (
        <div className="space-y-2">
          {keys.map((k) => (
            <div key={k.value} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-center gap-2">
              <span className="truncate text-[12.5px] text-zinc-600 dark:text-zinc-300">{k.label}</span>
              <ChoiceSelect label={`Campaign for ${k.label}`} value={map[k.value] ?? null} options={[{ value: "", label: "Not sent" }, ...campaigns]} onChange={(v) => onChange({ ...map, [k.value]: v })} />
            </div>
          ))}
        </div>
      );
    }
    case "number":
      return (
        <span className="flex items-center gap-2">
          <input
            type="number"
            inputMode="decimal"
            min={f.min}
            max={f.max}
            step={f.step ?? (f.integer ? 1 : "any")}
            value={value === null || value === undefined ? "" : String(value)}
            onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
            aria-label={f.label}
            className={cn(inputCls, "h-8 w-24 tabular-nums")}
          />
          {f.unit && <span className="text-[12.5px] text-zinc-500 dark:text-zinc-400">{f.unit}</span>}
        </span>
      );
    case "select": {
      const opts = f.optionsFrom ? (view.options[fieldKey(f)] ?? []) : f.options;
      if (f.optionsFrom && opts.length === 0) return <p className="text-[12.5px] text-zinc-500">Nothing to pick yet.</p>;
      return <ChoiceSelect label={f.label} value={value === null || value === undefined ? null : String(value)} options={opts} onChange={onChange} />;
    }
    case "text":
      return <input type="text" value={typeof value === "string" ? value : ""} maxLength={f.maxLength} placeholder={f.placeholder} onChange={(e) => onChange(e.target.value)} aria-label={f.label} className={cn(inputCls, "h-8")} />;
    case "textarea":
      return (
        <span className="block space-y-1">
          <textarea rows={f.maxLength > 2000 ? 6 : 3} value={typeof value === "string" ? value : ""} maxLength={f.maxLength} onChange={(e) => onChange(e.target.value)} aria-label={f.label} className={cn(inputCls, "resize-y py-2 leading-relaxed")} />
          {f.tokens && <span className="block text-[11.5px] text-zinc-400 dark:text-zinc-500">You can use {f.tokens.join(", ")}.</span>}
        </span>
      );
    case "multi": {
      const choices: { value: string; label: string; hint?: string }[] = f.options ?? view.options[fieldKey(f)] ?? [];
      const picked = (Array.isArray(value) ? value : []) as string[];
      if (choices.length === 0) return <span className="block text-[12.5px] text-zinc-500">Nothing to choose from yet.</span>;
      // Choices that need explaining read as a checklist.
      if (choices.some((o) => o.hint)) {
        return (
          <ul className="space-y-1">
            {choices.map((o) => {
              const on = picked.includes(o.value);
              return (
                <li key={o.value}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => onChange(on ? picked.filter((x) => x !== o.value) : [...picked, o.value])}
                    className="flex w-full items-start gap-2.5 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-zinc-900/[0.03] dark:hover:bg-white/[0.03] cursor-pointer"
                  >
                    <span className={cn("mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border", on ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900" : "border-zinc-300 dark:border-white/20")}>
                      {on && <Check className="h-3 w-3" strokeWidth={3} />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] text-zinc-900 dark:text-zinc-100">{o.label}</span>
                      {o.hint && <span className="block text-[11.5px] leading-relaxed text-zinc-500 dark:text-zinc-400">{o.hint}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        );
      }
      return (
        <span className="block space-y-1">
          <span className="flex flex-wrap gap-1.5">
            {choices.map((o) => {
              const on = picked.includes(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onChange(on ? picked.filter((x) => x !== o.value) : [...picked, o.value])}
                  className={cn(
                    "h-7 rounded-md border px-2.5 text-[12.5px] transition-colors cursor-pointer",
                    on ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900" : "border-zinc-200 text-zinc-600 hover:border-zinc-400 dark:border-white/10 dark:text-zinc-300 dark:hover:border-white/25"
                  )}
                >
                  {o.label}
                </button>
              );
            })}
          </span>
          {f.allWhenEmpty && picked.length === 0 && <span className="block text-[11.5px] text-zinc-400 dark:text-zinc-500">None picked means all of them.</span>}
        </span>
      );
    }
    case "list": {
      const items = (Array.isArray(value) ? value : []) as string[];
      return (
        <span className="block space-y-1.5">
          {items.map((item, i) => (
            <span key={i} className="flex items-center gap-1.5">
              <input type="text" value={item} maxLength={f.maxLength} placeholder={f.placeholder} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} aria-label={`${f.label} ${i + 1}`} className={cn(inputCls, "h-8")} />
              <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label="Remove" className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-zinc-400 hover:bg-zinc-900/5 hover:text-zinc-700 dark:hover:bg-white/5 dark:hover:text-zinc-200 cursor-pointer">
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
          {items.length < f.maxItems && (
            <button type="button" onClick={() => onChange([...items, ""])} className="inline-flex items-center gap-1 text-[12.5px] text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 cursor-pointer">
              <Plus className="h-3 w-3" /> Add {items.length ? "another" : "one"}
            </button>
          )}
        </span>
      );
    }
    default:
      return null;
  }
}

/** The tools as round logos: a tool is picked from its card (connecting it
 * there if it isn't yet); a choice with nothing to connect is picked by a click. */
function ToolRow(p: RowProps & { field: Extract<SettingField, { kind: "tool" }> }) {
  const { field: f, value, onChange, view } = p;
  const picked = (f.multi ? (Array.isArray(value) ? value : []) : typeof value === "string" ? [value] : []) as string[];
  const pick = (c: ToolChoice) => {
    if (f.multi) onChange(picked.includes(c.value) ? picked.filter((x) => x !== c.value) : [...picked, c.value]);
    else onChange(c.value);
  };
  const unknown = !f.multi && typeof value === "string" && value && !f.choices.some((c) => c.value === value);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-x-3 gap-y-3">
        {f.choices.map((c) => {
          const on = picked.includes(c.value);
          if (c.tool) {
            const tool = c.label ? { ...c.tool, label: c.label } : c.tool;
            const state = view.tools.find((t) => t.provider === c.tool!.provider);
            return (
              <div key={c.value} className="relative">
                <ToolAvatar tool={tool} state={state} selected={on} buyer={view.buyer} actions={p.actionsFor(() => (f.multi ? !on && pick(c) : onChange(c.value)))} size={40} />
                {f.multi && on && (
                  <button type="button" onClick={() => pick(c)} className="mt-1 block w-full text-center text-[10.5px] text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 cursor-pointer">
                    Remove
                  </button>
                )}
              </div>
            );
          }
          return <PlainChoice key={c.value} choice={c} on={on} onPick={() => pick(c)} />;
        })}
      </div>
      {unknown && <p className="text-[12px] text-zinc-500 dark:text-zinc-400">Set to something not listed here. Pick one above to change it.</p>}
    </div>
  );
}

function PlainChoice({ choice: c, on, onPick }: { choice: ToolChoice; on: boolean; onPick: () => void }) {
  const Icon = c.icon === "off" ? Ban : c.icon === "note" ? NotebookPen : c.icon === "tag" ? Tag : null;
  return (
    <button type="button" onClick={onPick} aria-pressed={on} aria-label={c.label} className="group flex flex-col items-center gap-1.5 outline-none cursor-pointer">
      <span
        className={cn(
          "relative flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-elevation-1 ring-1 ring-black/10 transition-shadow group-hover:shadow-elevation-2 dark:bg-zinc-900 dark:ring-white/10",
          on && "ring-2 ring-[var(--ink)] dark:ring-[var(--ink)]"
        )}
      >
        {c.logo ? <PlatformLogo provider={c.logo} size={21} monogram={c.label} /> : Icon ? <Icon className="h-4 w-4 text-zinc-500 dark:text-zinc-400" /> : null}
        {on && (
          <span className="absolute -bottom-0.5 -right-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-background bg-[var(--ink)] text-[var(--ink-foreground)]">
            <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
          </span>
        )}
      </span>
      <span className={cn("max-w-[72px] truncate text-[11px] leading-none", on ? "font-medium text-[var(--text-primary)]" : "text-[var(--text-muted)]")}>{c.label}</span>
    </button>
  );
}

/** A choice from a styled list, opened under its button. */
export function ChoiceSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | null;
  options: { value: string; label: string; hint?: string }[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const current = options.find((o) => o.value === value) ?? null;
  const shown = query ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase())) : options;
  return (
    <AnchoredCard
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setQuery("");
      }}
      label={label}
      width={300}
      placement="bottom-start"
      anchor={(props) => (
        <button type="button" {...props} aria-haspopup="listbox" aria-label={label} className={cn(inputCls, "flex h-8 items-center justify-between gap-2 text-left cursor-pointer")}>
          <span className={cn("truncate", !current && "text-zinc-400 dark:text-zinc-500")}>{current?.label ?? "Choose…"}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
        </button>
      )}
    >
      <div className="p-1.5">
        {options.length > 8 && (
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" aria-label={`Search ${label}`} className={cn(inputCls, "mb-1.5 h-8")} />
        )}
        <ul role="listbox" aria-label={label} className="max-h-64 overflow-y-auto">
          {shown.map((o) => {
            const active = o.value === value;
            return (
              <li key={o.value} role="option" aria-selected={active}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                    setQuery("");
                  }}
                  className={cn("flex w-full items-start gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors cursor-pointer", active ? "bg-[var(--accent-dim)]" : "hover:bg-[var(--accent-dim)]")}
                >
                  <Check className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", active ? "opacity-100" : "opacity-0")} />
                  <span className="min-w-0">
                    <span className="block text-[13px] text-[var(--text-primary)]">{o.label}</span>
                    {o.hint && <span className="mt-0.5 block text-[11.5px] leading-relaxed text-[var(--text-muted)]">{o.hint}</span>}
                  </span>
                </button>
              </li>
            );
          })}
          {shown.length === 0 && <li className="px-2 py-1.5 text-[12.5px] text-[var(--text-muted)]">No matches.</li>}
        </ul>
      </div>
    </AnchoredCard>
  );
}

/** One of a list read from the connected account, once it's connected. */
function LivePick(p: RowProps & { field: Extract<SettingField, { kind: "pick" }> }) {
  const { field: f, value, onChange, view, draft, engagementId } = p;
  const source = pickSource(f, draft);
  const provider = source ? PROVIDER_BY_RESOURCE[source.resource] : undefined;
  const connected = Boolean(provider && view.tools.find((t) => t.provider === provider)?.linked);
  // A value typed above (Twilio's Account SID), else what's known about the client.
  const params = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(source?.params ?? {}).map(([k, path]) => {
          const v = draft[path] ?? view.context[path];
          return [k, typeof v === "string" ? v : ""];
        })
      ),
    [source, draft, view.context]
  );
  const missing = Object.entries(params).find(([, v]) => !v);
  const qs = new URLSearchParams(params).toString();
  const [state, setState] = useState<{ key: string; options?: { value: string; label: string }[]; error?: string } | null>(null);
  const key = `${source?.resource}?${qs}`;

  useEffect(() => {
    if (!source || !connected || missing) return;
    let live = true;
    fetch(`/api/engagements/${encodeURIComponent(engagementId)}/stack-options/${source.resource}${qs ? `?${qs}` : ""}`)
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as { options?: { id: string; name: string }[]; error?: string };
        if (!live) return;
        if (!res.ok) setState({ key, error: body.error ?? "Couldn't read the list." });
        else setState({ key, options: (body.options ?? []).map((o) => ({ value: o.id, label: o.name })) });
      })
      .catch(() => live && setState({ key, error: "Couldn't read the list." }));
    return () => {
      live = false;
    };
  }, [source, connected, missing, engagementId, qs, key]);

  if (!source) return <p className="text-[12.5px] text-zinc-500 dark:text-zinc-400">Pick the tool above first.</p>;
  if (!connected) return <p className="text-[12.5px] text-zinc-500 dark:text-zinc-400">Connect the tool above and its list shows here.</p>;
  if (missing) {
    const need = missing[0] === "locationId" ? "GoHighLevel's Location ID (in its card above)" : missing[0] === "baseUrl" ? "ActiveCampaign's account address (in its card above)" : "the field above";
    return <p className="text-[12.5px] text-zinc-500 dark:text-zinc-400">Add {need} first.</p>;
  }
  const current = state?.key === key ? state : null;
  if (!current) {
    return (
      <p className="flex items-center gap-2 text-[12.5px] text-zinc-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading from the account…
      </p>
    );
  }
  if (current.error) return <p className="text-[12.5px] text-rose-600 dark:text-rose-400">{current.error}</p>;
  const options = current.options ?? [];
  if (options.length === 0) return <p className="text-[12.5px] text-zinc-500">The account has none yet.</p>;
  return <ChoiceSelect label={f.label} value={typeof value === "string" ? value : null} options={[{ value: "", label: "None" }, ...options]} onChange={(v) => onChange(v || null)} />;
}

function CopyValue({ value, secret }: { value: string | null; secret?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [shown, setShown] = useState(false);
  if (!value) return <p className="text-[12.5px] text-zinc-500">{secret ? "Made once this is saved." : "Not available for this tool."}</p>;
  const hidden = secret && !shown;
  return (
    <div className="flex items-center gap-1.5">
      <code className="min-w-0 flex-1 truncate rounded-md border border-zinc-200 bg-white/60 px-2.5 py-1.5 font-mono text-[11.5px] text-zinc-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-300" title={hidden ? undefined : value}>
        {hidden ? "•".repeat(24) : value}
      </code>
      {secret && (
        <button
          type="button"
          onClick={() => setShown((x) => !x)}
          aria-label={shown ? "Hide" : "Show"}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-zinc-500 hover:bg-zinc-900/5 hover:text-zinc-900 dark:hover:bg-white/5 dark:hover:text-zinc-100 cursor-pointer"
        >
          {shown ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      )}
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
        aria-label="Copy"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-zinc-500 hover:bg-zinc-900/5 hover:text-zinc-900 dark:hover:bg-white/5 dark:hover:text-zinc-100 cursor-pointer"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

/** Rename rows: a field as Whop sends it, and the name the destination wants. */
function PairsEditor({ field: f, value, onChange }: { field: Extract<SettingField, { kind: "pairs" }>; value: SettingValue; onChange: (v: SettingValue) => void }) {
  // Rows are kept in order while typing; an object can't hold a blank key.
  const [rows, setRows] = useState<[string, string][]>(() => Object.entries((value && typeof value === "object" && !Array.isArray(value) ? value : {}) as Record<string, string>));
  const update = (next: [string, string][]) => {
    setRows(next);
    onChange(next.length ? (Object.fromEntries(next) as Record<string, unknown>) : null);
  };
  return (
    <div className="space-y-1.5">
      {rows.map(([from, to], i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input value={from} onChange={(e) => update(rows.map((r, j) => (j === i ? [e.target.value, r[1]] : r)))} placeholder={f.fromLabel} aria-label={`${f.fromLabel} ${i + 1}`} className={cn(inputCls, "h-8 font-mono")} />
          <span className="shrink-0 text-zinc-400">→</span>
          <input value={to} onChange={(e) => update(rows.map((r, j) => (j === i ? [r[0], e.target.value] : r)))} placeholder={f.toLabel} aria-label={`${f.toLabel} ${i + 1}`} className={cn(inputCls, "h-8 font-mono")} />
          <button type="button" onClick={() => update(rows.filter((_, j) => j !== i))} aria-label="Remove" className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-zinc-400 hover:bg-zinc-900/5 hover:text-zinc-700 dark:hover:bg-white/5 dark:hover:text-zinc-200 cursor-pointer">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      {rows.length < f.maxItems && (
        <button type="button" onClick={() => setRows([...rows, ["", ""]])} className="inline-flex items-center gap-1 text-[12.5px] text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 cursor-pointer">
          <Plus className="h-3 w-3" /> Add a rename
        </button>
      )}
    </div>
  );
}

/** Sequences sent as written: a subject and up to three emails each. */
function SequencesEditor({ field: f, value, onChange }: { field: Extract<SettingField, { kind: "sequences" }>; value: SettingValue; onChange: (v: SettingValue) => void }) {
  const list = (Array.isArray(value) ? value : []) as unknown as Touchset[];
  const [writing, setWriting] = useState<Touchset | null>(null);
  const set = (next: Touchset[]) => onChange(next.length ? (next as unknown as Record<string, unknown>[]) : null);
  return (
    <div className="space-y-2">
      {list.length > 0 && (
        <ul className="space-y-1">
          {list.map((t, i) => (
            <li key={i} className="flex items-center gap-2 rounded-md border border-zinc-200 px-2.5 py-1.5 dark:border-white/10">
              <span className="min-w-0 flex-1 truncate text-[13px] text-zinc-800 dark:text-zinc-200">{t.subject}</span>
              <span className="shrink-0 text-[11.5px] text-zinc-400">{[t.body1, t.body2, t.body3].filter(Boolean).length} emails</span>
              <button type="button" onClick={() => set(list.filter((_, j) => j !== i))} aria-label={`Remove ${t.subject}`} className="grid h-6 w-6 shrink-0 place-items-center rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 cursor-pointer">
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {list.length < f.minItems && <p className="text-[12px] text-amber-700 dark:text-amber-300">Add at least {f.minItems}.</p>}
      {writing ? (
        <div className="space-y-1.5 rounded-md border border-zinc-200 p-2.5 dark:border-white/10">
          <input value={writing.subject} onChange={(e) => setWriting({ ...writing, subject: e.target.value })} placeholder="Subject" aria-label="Subject" className={cn(inputCls, "h-8")} />
          {(["body1", "body2", "body3"] as const).map((k, i) => (
            <textarea key={k} rows={3} value={writing[k]} onChange={(e) => setWriting({ ...writing, [k]: e.target.value })} placeholder={i === 0 ? "First email" : `Follow-up ${i}${i === 2 ? " (optional)" : " (optional)"}`} aria-label={i === 0 ? "First email" : `Follow-up ${i}`} className={cn(inputCls, "resize-y py-2 leading-relaxed")} />
          ))}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setWriting(null)} className="h-7 rounded-md px-2.5 text-[12.5px] text-zinc-600 hover:bg-zinc-900/5 dark:text-zinc-300 dark:hover:bg-white/5 cursor-pointer">
              Cancel
            </button>
            <button
              type="button"
              disabled={!writing.subject.trim() || !writing.body1.trim()}
              onClick={() => {
                set([...list, writing]);
                setWriting(null);
              }}
              className="h-7 rounded-md bg-zinc-900 px-2.5 text-[12.5px] font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 cursor-pointer"
            >
              Add
            </button>
          </div>
        </div>
      ) : (
        list.length < f.maxItems && (
          <button type="button" onClick={() => setWriting({ subject: "", body1: "", body2: "", body3: "" })} className="inline-flex items-center gap-1 text-[12.5px] text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 cursor-pointer">
            <Plus className="h-3 w-3" /> Write one
          </button>
        )
      )}
    </div>
  );
}

/** The Google listing: what's confirmed now, and a search to pick another. */
function ListingPicker({ engagementId, value, onChange }: { engagementId: string; value: SettingValue; onChange: (v: SettingValue) => void }) {
  const current = (value && typeof value === "object" && !Array.isArray(value) ? value : null) as RepGoogleListing | null;
  const [query, setQuery] = useState("");
  const [state, setState] = useState<{ busy: boolean; results?: RepGoogleListing[]; error?: string }>({ busy: false });

  async function search() {
    if (query.trim().length < 2) return;
    setState({ busy: true });
    try {
      const res = await fetch(`/api/engagements/${encodeURIComponent(engagementId)}/google-listings?q=${encodeURIComponent(query.trim())}`);
      const body = (await res.json().catch(() => ({}))) as { listings?: RepGoogleListing[]; error?: string };
      setState(res.ok ? { busy: false, results: body.listings ?? [] } : { busy: false, error: body.error ?? "Couldn't search." });
    } catch {
      setState({ busy: false, error: "Couldn't search. Check the connection and try again." });
    }
  }

  return (
    <div className="space-y-2">
      {current ? (
        <div className="flex items-start gap-2 rounded-md border border-zinc-200 px-2.5 py-2 dark:border-white/10">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">{current.name}</p>
            <ListingLine l={current} />
          </div>
          <button type="button" onClick={() => onChange(null)} className="shrink-0 text-[12px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 cursor-pointer">
            Not us
          </button>
        </div>
      ) : (
        <p className="text-[12.5px] text-zinc-500 dark:text-zinc-400">None confirmed yet. Reviews aren&apos;t watched until one is.</p>
      )}
      <form
        className="flex items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Business name, city" aria-label="Search Google listings" className={cn(inputCls, "h-8")} />
        <button type="submit" disabled={state.busy || query.trim().length < 2} aria-label="Search" className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-zinc-200 text-zinc-600 hover:bg-zinc-900/5 disabled:opacity-40 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5 cursor-pointer">
          {state.busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
        </button>
      </form>
      {state.error && <p className="text-[12px] text-rose-600 dark:text-rose-400">{state.error}</p>}
      {state.results && state.results.length === 0 && <p className="text-[12px] text-zinc-500">No listings found. Try the name as it shows on Google, with the city.</p>}
      {state.results && state.results.length > 0 && (
        <ul className="space-y-1">
          {state.results.map((l) => (
            <li key={l.placeId}>
              <button
                type="button"
                onClick={() => {
                  onChange(l as unknown as Record<string, unknown>);
                  setState({ busy: false });
                  setQuery("");
                }}
                className="w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-zinc-900/[0.04] dark:hover:bg-white/[0.04] cursor-pointer"
              >
                <span className="block text-[13px] text-zinc-900 dark:text-zinc-100">{l.name}</span>
                <ListingLine l={l} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ListingLine({ l }: { l: RepGoogleListing }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 text-[11.5px] text-zinc-500 dark:text-zinc-400">
      {l.rating != null && (
        <span className="inline-flex items-center gap-0.5">
          <Star className="h-3 w-3" /> {l.rating}
          {l.reviews != null ? ` (${l.reviews})` : ""}
        </span>
      )}
      {l.address && <span className="truncate">{l.address}</span>}
      {l.site && <span className="truncate">{l.site.replace(/^https?:\/\//, "")}</span>}
    </span>
  );
}
