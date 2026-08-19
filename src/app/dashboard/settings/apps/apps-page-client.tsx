"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Mail, CheckCircle2, AlertCircle, X, RotateCw, Trash2 } from "lucide-react";

interface VaultItem {
  id: string;
  provider: string;
  label: string;
  healthStatus: string;
  createdAt: string;
  isComposioManaged: boolean;
}

interface PlatformDef {
  provider: string;
  label: string;
  group: string;
  composioManaged: boolean;
  placeholder?: string;
  howTo?: string;
}

// Same provider keys used across stack.booking_platform / stack.email_platform
// (see edit-stack-settings.tsx, connections/page.tsx) — this page manages the
// same vault those already read from, just at the workspace level instead of
// per-engagement.
const PLATFORMS: PlatformDef[] = [
  { provider: "calendly", label: "Calendly", group: "Booking platforms", composioManaged: true },
  {
    provider: "cal_com",
    label: "Cal.com",
    group: "Booking platforms",
    composioManaged: false,
    placeholder: "cal_live_...",
    howTo: "Cal.com → Settings → Developer → API Keys → Add",
  },
  { provider: "ghl_calendar", label: "GoHighLevel", group: "Booking platforms", composioManaged: true },
  {
    provider: "oncehub",
    label: "OnceHub",
    group: "Booking platforms",
    composioManaged: false,
    placeholder: "1.eyJh... (Client Secret)",
    howTo: "OnceHub → Admin → Integrations → API keys → Create OAuth client (or use your account API key)",
  },
  { provider: "klaviyo", label: "Klaviyo", group: "Email & CRM", composioManaged: true },
  { provider: "hubspot", label: "HubSpot", group: "Email & CRM", composioManaged: true },
  {
    provider: "activecampaign",
    label: "ActiveCampaign",
    group: "Email & CRM",
    composioManaged: false,
    placeholder: "abc123...",
    howTo: "ActiveCampaign → Settings → Developer → API Access → Copy key",
  },
  { provider: "mailchimp", label: "Mailchimp", group: "Email & CRM", composioManaged: true },
  {
    provider: "convertkit",
    label: "ConvertKit",
    group: "Email & CRM",
    composioManaged: false,
    placeholder: "ck_...",
    howTo: "ConvertKit → Settings → Advanced → API → Copy API Secret",
  },
  {
    provider: "smtp",
    label: "SMTP",
    group: "Email & CRM",
    composioManaged: false,
    placeholder: "smtp://user:pass@host:587",
    howTo: "Your email provider's SMTP credentials, as one connection string.",
  },
];

// Fixes the real bug: the connections page's <img src={`/logos/${provider}.png`}>
// silently fell back to a generic mail icon for cal_com and convertkit because
// the actual files on disk are cal.png and kit.png. ghl_calendar and smtp have
// no logo asset at all yet — those two still fall back, which is honest rather
// than guessing at a filename that doesn't exist.
const LOGO_FILENAME_OVERRIDES: Record<string, string> = {
  cal_com: "cal",
  convertkit: "kit",
};

function PlatformLogo({ provider }: { provider: string }) {
  const [hasError, setHasError] = useState(false);
  if (hasError) return <Mail className="w-5 h-5 shrink-0 text-zinc-400" />;
  const filename = LOGO_FILENAME_OVERRIDES[provider] ?? provider;
  return (
    <img
      src={`/logos/${filename}.png`}
      alt={`${provider} logo`}
      className="w-5 h-5 shrink-0 object-contain"
      onError={() => setHasError(true)}
    />
  );
}

function groupBy<T, K extends string>(items: T[], key: (item: T) => K): Record<K, T[]> {
  return items.reduce((acc, item) => {
    const k = key(item);
    (acc[k] ??= []).push(item);
    return acc;
  }, {} as Record<K, T[]>);
}

export function AppsPageClient({ initialItems }: { initialItems: VaultItem[] }) {
  const searchParams = useSearchParams();
  const [items, setItems] = useState(initialItems);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [addKeyFor, setAddKeyFor] = useState<PlatformDef | null>(null);
  const [banner, setBanner] = useState<{ kind: "ok" | "error"; message: string } | null>(() => {
    const connected = searchParams.get("composio_connected");
    const error = searchParams.get("composio_error");
    if (connected) return { kind: "ok", message: `${connected} connected.` };
    if (error) return { kind: "error", message: error };
    return null;
  });

  async function refresh() {
    const res = await fetch("/api/credential-vault");
    if (res.ok) {
      const data = await res.json();
      setItems(data.items);
    }
  }

  async function connect(provider: string) {
    setConnecting(provider);
    try {
      const res = await fetch("/api/composio/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBanner({ kind: "error", message: data.error ?? "Couldn't start the connection." });
        setConnecting(null);
        return;
      }
      // Full navigation, not a popup — Composio's hosted page redirects
      // straight back to /api/composio/callback when it's done.
      window.location.assign(data.redirectUrl);
    } catch {
      setBanner({ kind: "error", message: "Network error. Try again." });
      setConnecting(null);
    }
  }

  const grouped = groupBy(PLATFORMS, (p) => p.group);

  return (
    <div className="max-w-4xl space-y-6 font-sans">
      <div>
        <h1 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
          Apps
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
          Connect the platforms your clients use once here — every engagement can reuse what&apos;s saved, instead of
          pasting the same key per client.
        </p>
      </div>

      {banner && (
        <div
          className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg text-sm"
          style={{
            background: banner.kind === "ok" ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
            color: banner.kind === "ok" ? "rgb(21,128,61)" : "rgb(185,28,28)",
          }}
        >
          <span className="flex items-center gap-2">
            {banner.kind === "ok" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            {banner.message}
          </span>
          <button type="button" onClick={() => setBanner(null)} className="cursor-pointer opacity-70 hover:opacity-100">
            <X size={14} />
          </button>
        </div>
      )}

      {Object.entries(grouped).map(([group, platforms]) => (
        <div key={group} className="space-y-2">
          <h2 className="text-xs font-mono font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
            {group}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {platforms.map((platform) => {
              const saved = items.filter((i) => i.provider === platform.provider);
              return (
                <div
                  key={platform.provider}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg"
                  style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                >
                  <PlatformLogo provider={platform.provider} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>
                      {platform.label}
                    </p>
                    {saved.length > 0 && (
                      <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                        {saved.length} saved
                      </p>
                    )}
                  </div>
                  {platform.composioManaged ? (
                    <button
                      type="button"
                      onClick={() => connect(platform.provider)}
                      disabled={connecting === platform.provider}
                      className="shrink-0 text-[11px] font-medium px-2 py-1 rounded-md cursor-pointer disabled:opacity-50"
                      style={{ background: "var(--surface-2)", color: "var(--text-primary)" }}
                    >
                      {connecting === platform.provider ? "..." : "Connect"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setAddKeyFor(platform)}
                      className="shrink-0 text-[11px] font-medium px-2 py-1 rounded-md cursor-pointer"
                      style={{ background: "var(--surface-2)", color: "var(--text-primary)" }}
                    >
                      Add key
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div className="space-y-2 pt-2">
        <h2 className="text-xs font-mono font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
          Saved credentials
        </h2>
        {items.length === 0 ? (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Nothing saved yet — connect or add a key above.
          </p>
        ) : (
          <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            {items.map((item) => (
              <VaultRow key={item.id} item={item} onChanged={refresh} />
            ))}
          </div>
        )}
      </div>

      {addKeyFor && (
        <AddKeyModal
          platform={addKeyFor}
          onClose={() => setAddKeyFor(null)}
          onSaved={() => {
            setAddKeyFor(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function VaultRow({ item, onChanged }: { item: VaultItem; onChanged: () => void }) {
  const [rotating, setRotating] = useState(false);
  const [rotateValue, setRotateValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function rotate() {
    if (!rotateValue.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/credential-vault/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: rotateValue.trim() }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to rotate.");
      return;
    }
    setRotating(false);
    setRotateValue("");
    onChanged();
  }

  async function del() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/credential-vault/${item.id}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to delete.");
      return;
    }
    onChanged();
  }

  return (
    <div className="px-4 py-3 space-y-2" style={{ borderBottom: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
            {item.label}
          </p>
          <p className="text-[11px] font-mono" style={{ color: "var(--text-muted)" }}>
            {item.provider} · {item.isComposioManaged ? "via Composio" : "manual key"} ·{" "}
            {item.healthStatus === "invalid" ? (
              <span style={{ color: "rgb(185,28,28)" }}>needs attention</span>
            ) : (
              item.healthStatus
            )}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!item.isComposioManaged && (
            <button
              type="button"
              onClick={() => setRotating((r) => !r)}
              title="Rotate key"
              className="p-1.5 rounded-md cursor-pointer"
              style={{ color: "var(--text-muted)" }}
            >
              <RotateCw size={14} />
            </button>
          )}
          <button
            type="button"
            onClick={del}
            disabled={busy}
            title="Delete"
            className="p-1.5 rounded-md cursor-pointer disabled:opacity-50"
            style={{ color: "var(--text-muted)" }}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      {rotating && (
        <div className="flex items-center gap-2">
          <input
            type="password"
            value={rotateValue}
            onChange={(e) => setRotateValue(e.target.value)}
            placeholder="New key value"
            className="flex-1 text-xs px-2 py-1.5 rounded border"
            style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text-primary)" }}
          />
          <button
            type="button"
            onClick={rotate}
            disabled={busy || !rotateValue.trim()}
            className="text-[11px] font-medium px-2 py-1.5 rounded-md cursor-pointer disabled:opacity-50"
            style={{ background: "var(--surface-2)", color: "var(--text-primary)" }}
          >
            Save
          </button>
        </div>
      )}
      {error && (
        <p className="text-[11px]" style={{ color: "rgb(185,28,28)" }}>
          {error}
        </p>
      )}
    </div>
  );
}

function AddKeyModal({ platform, onClose, onSaved }: { platform: PlatformDef; onClose: () => void; onSaved: () => void }) {
  const [label, setLabel] = useState(platform.label);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!value.trim() || !label.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/credential-vault", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: platform.provider, label: label.trim(), value: value.trim() }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to save.");
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div className="w-full max-w-sm rounded-xl p-5 space-y-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Add {platform.label} key
          </h3>
          <button type="button" onClick={onClose} className="cursor-pointer" style={{ color: "var(--text-muted)" }}>
            <X size={16} />
          </button>
        </div>
        {platform.howTo && (
          <p className="text-[11px] font-mono leading-relaxed" style={{ color: "var(--text-muted)" }}>
            {platform.howTo}
          </p>
        )}
        <label className="space-y-1 block">
          <span className="text-[11px] font-mono uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
            Label
          </span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full text-xs px-2 py-1.5 rounded border"
            style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text-primary)" }}
          />
        </label>
        <label className="space-y-1 block">
          <span className="text-[11px] font-mono uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
            Key
          </span>
          <input
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={platform.placeholder}
            className="w-full text-xs font-mono px-2 py-1.5 rounded border"
            style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text-primary)" }}
          />
        </label>
        {error && (
          <p className="text-[11px]" style={{ color: "rgb(185,28,28)" }}>
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-medium px-3 py-1.5 rounded-md cursor-pointer"
            style={{ color: "var(--text-muted)" }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy || !value.trim()}
            className="text-xs font-medium px-3 py-1.5 rounded-md cursor-pointer disabled:opacity-50"
            style={{ background: "var(--surface-2)", color: "var(--text-primary)" }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
