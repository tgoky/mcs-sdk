"use client";

// src/components/skill-settings/skill-settings-panel.tsx
//
// One skill's own settings, edited in place (lib/skill-settings): what the
// skill does, the knobs that change how it behaves, and what it runs on.
// Tools, keys and destinations are shown as facts and changed in the
// product's setup, which is linked, never embedded here.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Loader2, Plus, X } from "lucide-react";
import { Switch } from "@/components/product-setup/skill-switch";
import { cn } from "@/lib/utils";
import { fieldKey, isShown, settingsFor, toShown, type SettingField, type SettingValue, type SettingValues } from "@/lib/skill-settings/schema";
import type { SkillSettingsView } from "@/lib/skill-settings/server";

const inputCls =
  "w-full rounded-sm border border-zinc-200 bg-white/60 px-2.5 text-[13px] text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-400 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-white/25";

function isSettingsView(v: unknown): v is SkillSettingsView {
  const o = v as Partial<SkillSettingsView> | null;
  return Boolean(o && typeof o.name === "string" && o.values && Array.isArray(o.facts));
}

function shownValues(fields: SettingField[], values: SettingValues): SettingValues {
  return Object.fromEntries(fields.map((f) => [fieldKey(f), toShown(f, values[fieldKey(f)] ?? null)]));
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
  /** After a save went through. */
  onSaved?: () => void;
}) {
  const spec = settingsFor(skillId);
  const fields = useMemo(() => spec?.fields ?? [], [spec]);
  const url = `/api/engagements/${encodeURIComponent(engagementId)}/skills/${encodeURIComponent(skillId)}/settings`;

  const [view, setView] = useState<SkillSettingsView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<SettingValues>({});
  const [saved, setSaved] = useState<SettingValues>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ text: string; field?: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch(url, { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!live) return;
        if (!res.ok || !isSettingsView(body)) return setLoadError((body as { error?: string }).error ?? "Couldn't load these settings.");
        setView(body);
        const shown = shownValues(fields, body.values);
        setDraft(shown);
        setSaved(shown);
      })
      .catch(() => live && setLoadError("Couldn't load these settings."));
    return () => {
      live = false;
    };
  }, [url, fields]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const set = (key: string, value: SettingValue) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setError(null);
    setNotice(null);
  };

  async function save() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; field?: string; notice?: string };
      if (!res.ok || !body.ok) {
        setError({ text: body.error ?? "Couldn't save.", field: body.field });
        return;
      }
      setSaved(draft);
      if (body.notice) setNotice(body.notice);
      else onSaved?.();
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

  const shown = fields.filter((f) => isShown(f, draft));
  const hasSettings = fields.length > 0 && !view.blocked;

  return (
    <div className="space-y-4 p-4">
      <header className="space-y-1">
        <p className="text-[15px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">{view.name}</p>
        <p className="line-clamp-2 text-[12.5px] leading-relaxed text-zinc-500 dark:text-zinc-400">{view.description}</p>
      </header>

      {view.blocked ? (
        <p className="text-[13px] text-zinc-600 dark:text-zinc-300">{view.blocked}</p>
      ) : hasSettings ? (
        <div className="space-y-3.5">
          {shown.map((f) => (
            <FieldRow key={fieldKey(f)} field={f} value={draft[fieldKey(f)] ?? null} onChange={(v) => set(fieldKey(f), v)} view={view} error={error?.field === fieldKey(f) ? error.text : null} />
          ))}
        </div>
      ) : (
        <p className="text-[13px] text-zinc-600 dark:text-zinc-300">Nothing to set for this skill. It runs on its own.</p>
      )}

      {view.facts.length > 0 && (
        <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1.5 border-t border-zinc-200/70 pt-3 text-[12.5px] dark:border-white/10">
          {view.facts.map((fact) => (
            <div key={fact.label} className="contents">
              <dt className="text-zinc-500 dark:text-zinc-400">{fact.label}</dt>
              <dd className="min-w-0 break-words text-zinc-800 dark:text-zinc-200">{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {error && !error.field && <p className="text-[12.5px] text-rose-600 dark:text-rose-400">{error.text}</p>}
      {notice && <p className="text-[12.5px] text-amber-700 dark:text-amber-300">{notice}</p>}

      <footer className="flex items-center justify-between gap-3 border-t border-zinc-200/70 pt-3 dark:border-white/10">
        <Link href={view.setupHref} className="inline-flex items-center gap-1 text-[12.5px] text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
          Tools and connections in setup <ArrowUpRight className="h-3 w-3" />
        </Link>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onClose} className="h-8 rounded-sm px-3 text-[13px] text-zinc-600 transition-colors hover:bg-zinc-900/5 dark:text-zinc-300 dark:hover:bg-white/5 cursor-pointer">
            {hasSettings ? "Cancel" : "Close"}
          </button>
          {hasSettings && (
            <button
              type="button"
              onClick={save}
              disabled={!dirty || saving}
              className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-zinc-900 px-3 text-[13px] font-medium text-white transition-opacity disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 cursor-pointer disabled:cursor-default"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}

function FieldRow({ field: f, value, onChange, view, error }: { field: SettingField; value: SettingValue; onChange: (v: SettingValue) => void; view: SkillSettingsView; error: string | null }) {
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
          <Switch on={locked ? Boolean(locked.value) : value === true} onChange={(on) => onChange(on)} label={f.label} />
        </div>
      </div>
    );
  }

  return (
    <label className="block space-y-1">
      <span className="text-[12.5px] font-medium text-zinc-700 dark:text-zinc-300">{f.label}</span>
      <Control field={f} value={value} onChange={onChange} options={view.options[fieldKey(f)]} />
      {help && <span className="block text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">{help}</span>}
      {error && <span className="block text-[12px] text-rose-600 dark:text-rose-400">{error}</span>}
    </label>
  );
}

function Control({ field: f, value, onChange, options }: { field: SettingField; value: SettingValue; onChange: (v: SettingValue) => void; options?: { value: string; label: string }[] }) {
  switch (f.kind) {
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
    case "select":
      return (
        <select value={value === null || value === undefined ? "" : String(value)} onChange={(e) => onChange(e.target.value)} aria-label={f.label} className={cn(inputCls, "h-8 cursor-pointer")}>
          {f.default === null && <option value="">Choose…</option>}
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    case "text":
      return <input type="text" value={typeof value === "string" ? value : ""} maxLength={f.maxLength} placeholder={f.placeholder} onChange={(e) => onChange(e.target.value)} aria-label={f.label} className={cn(inputCls, "h-8")} />;
    case "textarea":
      return (
        <span className="block space-y-1">
          <textarea rows={3} value={typeof value === "string" ? value : ""} maxLength={f.maxLength} onChange={(e) => onChange(e.target.value)} aria-label={f.label} className={cn(inputCls, "resize-y py-2 leading-relaxed")} />
          {f.tokens && <span className="block text-[11.5px] text-zinc-400 dark:text-zinc-500">You can use {f.tokens.join(", ")}.</span>}
        </span>
      );
    case "multi": {
      const choices = f.options ?? options ?? [];
      const picked = Array.isArray(value) ? value : [];
      if (choices.length === 0) return <span className="block text-[12.5px] text-zinc-500">Nothing to choose from yet.</span>;
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
                  onClick={() => onChange(on ? picked.filter((p) => p !== o.value) : [...picked, o.value])}
                  className={cn(
                    "h-7 rounded-sm border px-2.5 text-[12.5px] transition-colors cursor-pointer",
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
      const items = Array.isArray(value) ? value : [];
      return (
        <span className="block space-y-1.5">
          {items.map((item, i) => (
            <span key={i} className="flex items-center gap-1.5">
              <input type="text" value={item} maxLength={f.maxLength} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} aria-label={`${f.label} ${i + 1}`} className={cn(inputCls, "h-8")} />
              <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label="Remove" className="grid h-8 w-8 shrink-0 place-items-center rounded-sm text-zinc-400 hover:bg-zinc-900/5 hover:text-zinc-700 dark:hover:bg-white/5 dark:hover:text-zinc-200 cursor-pointer">
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
