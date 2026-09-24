"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, AlertCircle, X, RotateCw, Trash2, LayoutGrid } from "lucide-react";
import { PlatformLogo } from "@/components/platform-logo";

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
  /** Short, factual one-liner — what connecting this actually does inside
   * the app, not marketing copy. Shown on the card where a marketplace
   * listing would put install count / pricing. */
  description: string;
  placeholder?: string;
  howTo?: string;
}

// Same provider keys used across stack.booking_platform / stack.email_platform
// (see edit-stack-settings.tsx, connections/page.tsx) — this page manages the
// same vault those already read from, just at the workspace level instead of
// per-engagement.
const PLATFORMS: PlatformDef[] = [
  {
    provider: "calendly",
    label: "Calendly",
    group: "Booking platforms",
    composioManaged: true,
    description: "Pulls booked calls, invitee answers, and reschedules into every client automatically.",
  },
  {
    provider: "cal_com",
    label: "Cal.com",
    group: "Booking platforms",
    composioManaged: false,
    description: "Pulls booked calls and invitee details from your Cal.com account.",
    placeholder: "cal_live_...",
    howTo: "Cal.com → Settings → Developer → API Keys → Add",
  },
  {
    provider: "ghl_calendar",
    label: "GoHighLevel",
    group: "Booking platforms",
    composioManaged: true,
    description: "Pulls booked appointments straight from your GoHighLevel calendar.",
  },
  {
    provider: "oncehub",
    label: "OnceHub",
    group: "Booking platforms",
    composioManaged: false,
    description: "Pulls booked calls and confirmations from OnceHub.",
    placeholder: "1.eyJh... (Client Secret)",
    howTo: "OnceHub → Admin → Integrations → API keys → Create OAuth client (or use your account API key)",
  },
  {
    provider: "klaviyo",
    label: "Klaviyo",
    group: "Email & CRM",
    composioManaged: true,
    description: "Sends follow-up and win-back sequences through Klaviyo.",
  },
  {
    provider: "hubspot",
    label: "HubSpot",
    group: "Email & CRM",
    composioManaged: true,
    description: "Sends follow-up sequences and syncs contacts through HubSpot.",
  },
  {
    provider: "activecampaign",
    label: "ActiveCampaign",
    group: "Email & CRM",
    composioManaged: false,
    description: "Sends follow-up and win-back sequences through ActiveCampaign.",
    placeholder: "abc123...",
    howTo: "ActiveCampaign → Settings → Developer → API Access → Copy key",
  },
  {
    provider: "mailchimp",
    label: "Mailchimp",
    group: "Email & CRM",
    composioManaged: true,
    description: "Sends follow-up and win-back sequences through Mailchimp.",
  },
  {
    provider: "convertkit",
    label: "ConvertKit",
    group: "Email & CRM",
    composioManaged: false,
    description: "Sends follow-up and win-back sequences through ConvertKit.",
    placeholder: "ck_...",
    howTo: "ConvertKit → Settings → Advanced → API → Copy API Secret",
  },
  {
    provider: "smtp",
    label: "SMTP",
    group: "Email & CRM",
    composioManaged: false,
    description: "Sends emails directly through your own mail server. No CRM required.",
    placeholder: "smtp://user:pass@host:587",
    howTo: "Your email provider's SMTP credentials, as one connection string.",
  },
  {
    provider: "ghl",
    label: "GoHighLevel (CRM & Email)",
    group: "Email & CRM",
    composioManaged: true,
    description: "Sends follow-ups and reads CRM activity through GoHighLevel. A separate connection from GoHighLevel Calendar above, since this app stores them as two distinct credentials even on the same GHL account.",
  },
  // Cold Open's own sending/reply platforms — audited against every
  // resolveCredential() call site in the codebase (send-connect-config-
  // form.tsx, source-connect-config-form.tsx, cold-open/server/esp/*.ts)
  // rather than guessed; these had no Apps entry at all before, so there
  // was no reusable-vault path for any Cold Open client.
  {
    provider: "cold_open_instantly",
    label: "Instantly",
    group: "Outreach & Cold Email",
    composioManaged: false,
    description: "Sends and tracks Cold Open's cold email sequences through Instantly.",
    placeholder: "your Instantly API key",
    howTo: "Instantly → Settings → Integrations → API Key",
  },
  {
    provider: "cold_open_smartlead",
    label: "Smartlead",
    group: "Outreach & Cold Email",
    composioManaged: false,
    description: "Sends and tracks Cold Open's cold email sequences through Smartlead.",
    placeholder: "your Smartlead API key",
    howTo: "Smartlead → Settings → API Keys → Generate",
  },
  {
    provider: "cold_open_lemlist",
    label: "Lemlist",
    group: "Outreach & Cold Email",
    composioManaged: false,
    description: "Sends and tracks Cold Open's cold email sequences through Lemlist.",
    placeholder: "your Lemlist API key",
    howTo: "Lemlist → Settings → Integrations → API Key",
  },
  {
    provider: "cold_open_reply_io",
    label: "Reply.io",
    group: "Outreach & Cold Email",
    composioManaged: false,
    description: "Sends and tracks Cold Open's cold email sequences through Reply.io.",
    placeholder: "your Reply.io API key",
    howTo: "Reply.io → Settings → API → Generate key",
  },
  {
    provider: "cold_open_apify",
    label: "Apify",
    group: "Outreach & Cold Email",
    composioManaged: false,
    description: "Pulls lead lists for Cold Open's outreach sources.",
    placeholder: "apify_api_...",
    howTo: "Apify Console → Settings → Integrations → API token",
  },
  {
    provider: "recall_ai",
    label: "Recall.ai",
    group: "Call Intelligence",
    composioManaged: false,
    description: "Records and transcribes calls for conversation intelligence in Pre-Call Read.",
    placeholder: "your Recall.ai API key",
    howTo: "Recall.ai dashboard → API Keys → Create key",
  },
  {
    provider: "apollo",
    label: "Apollo",
    group: "Prospect Research",
    composioManaged: false,
    description: "Optional prospect enrichment source for Pre-Call Read's briefs.",
    placeholder: "your Apollo API key",
    howTo: "Apollo.io → Settings → Integrations → API → Create key",
  },
  {
    provider: "pdl",
    label: "People Data Labs",
    group: "Prospect Research",
    composioManaged: false,
    description: "Optional prospect enrichment source for Pre-Call Read's briefs.",
    placeholder: "your PDL API key",
    howTo: "PDL dashboard → API Keys → Create key",
  },
  {
    provider: "vidalytics",
    label: "Vidalytics",
    group: "Video Engagement",
    composioManaged: false,
    description: "Pulls confirmation-page video watch data into Pre-Call Read's briefs.",
    placeholder: "your Vidalytics API key",
    howTo: "Vidalytics → Account → API → Copy key",
  },
  {
    provider: "wistia",
    label: "Wistia",
    group: "Video Engagement",
    composioManaged: false,
    description: "Pulls confirmation-page video watch data into Pre-Call Read's briefs.",
    placeholder: "your Wistia API key",
    howTo: "Wistia → Account Settings → API Access → Create token",
  },
  {
    provider: "youtube_analytics",
    label: "YouTube Analytics",
    group: "Video Engagement",
    composioManaged: false,
    description: "Pulls confirmation-page video watch data into Pre-Call Read's briefs.",
    placeholder: "your Google API key",
    howTo: "Google Cloud Console → YouTube Data API → credentials",
  },
];

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
  // Derived from PLATFORMS' own `group` field rather than a second
  // hardcoded list — adding a new group to PLATFORMS is enough for it to
  // show up as its own filter here too.
  const categories = useMemo(() => Array.from(new Set(PLATFORMS.map((p) => p.group))), []);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
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

  // "All apps" groups by product area with its own heading, same as
  // before; picking one category flattens to a single grid under that
  // category's own heading instead — the sidebar is the group picker now,
  // so a repeated heading right below it would be redundant.
  const visiblePlatforms = activeCategory ? PLATFORMS.filter((p) => p.group === activeCategory) : PLATFORMS;
  const grouped = groupBy(visiblePlatforms, (p) => p.group);

  return (
    <div className="max-w-6xl space-y-6 font-sans">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
          Apps
        </h1>
        <p className="text-[15px] mt-1" style={{ color: "var(--text-muted)" }}>
          Connect the platforms your clients use once here. Every engagement can reuse what&apos;s saved, instead of
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

      <div className="flex flex-col md:flex-row md:items-start gap-6">
        <aside className="w-full md:w-44 md:shrink-0 md:sticky md:top-4 space-y-4">
          <div>
            <p className="px-2.5 pb-1.5 text-[10px] font-mono font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              Browse
            </p>
            <nav className="space-y-0.5">
              <button
                type="button"
                onClick={() => setActiveCategory(null)}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium text-left cursor-pointer transition-colors"
                style={
                  activeCategory === null
                    ? { background: "var(--surface-2)", color: "var(--text-primary)" }
                    : { color: "var(--text-muted)" }
                }
              >
                <LayoutGrid size={13} className="shrink-0" />
                All apps
                <span className="ml-auto text-[10px] tabular-nums opacity-70">{PLATFORMS.length}</span>
              </button>
            </nav>
          </div>
          <div>
            <p className="px-2.5 pb-1.5 text-[10px] font-mono font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              Categories
            </p>
            <nav className="space-y-0.5">
              {categories.map((category) => {
                const count = PLATFORMS.filter((p) => p.group === category).length;
                const isActive = activeCategory === category;
                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setActiveCategory(category)}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium text-left cursor-pointer transition-colors"
                    style={isActive ? { background: "var(--surface-2)", color: "var(--text-primary)" } : { color: "var(--text-muted)" }}
                  >
                    <span className="truncate">{category}</span>
                    <span className="ml-auto text-[10px] tabular-nums opacity-70">{count}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </aside>

        <div className="flex-1 min-w-0 space-y-6">
          {Object.entries(grouped).map(([group, platforms]) => (
            <div key={group} className="space-y-3">
              {activeCategory === null && (
                <h2 className="text-sm font-mono font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                  {group}
                </h2>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {platforms.map((platform) => {
                  const saved = items.filter((i) => i.provider === platform.provider);
                  const isConnected = saved.length > 0;
                  return (
                    <div
                      key={platform.provider}
                      // Dark mode: match the secondary sidebar's own --sidebar
                      // token instead of --surface — richer/darker, same
                      // background already sitting behind this page's own
                      // Settings nav a moment ago. Light mode unchanged.
                      className="flex flex-col gap-3 p-4 rounded-lg transition-colors bg-[var(--surface)] dark:bg-sidebar hover:border-zinc-300 dark:hover:border-zinc-700"
                      style={{ border: "1px solid var(--border)" }}
                    >
                      <div className="flex items-start gap-3">
                        <PlatformLogo provider={platform.provider} size={40} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="text-[15px] font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                              {platform.label}
                            </p>
                            {isConnected && (
                              <CheckCircle2 size={13} className="shrink-0" style={{ color: "rgb(21,128,61)" }} />
                            )}
                          </div>
                          <p className="text-sm mt-0.5 leading-snug line-clamp-2" style={{ color: "var(--text-muted)" }}>
                            {platform.description}
                          </p>
                        </div>
                      </div>

                      {/* Where a marketplace listing would show install count / pricing — here it's
                          real connection status on the left and the actual action on the right. */}
                      <div
                        className="flex items-center justify-between gap-2 pt-3 mt-auto"
                        style={{ borderTop: "1px solid var(--border)" }}
                      >
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                          {isConnected ? `${saved.length} saved` : "Not connected"}
                        </span>
                        {platform.composioManaged ? (
                          <button
                            type="button"
                            onClick={() => connect(platform.provider)}
                            disabled={connecting === platform.provider}
                            className="text-sm font-semibold px-3 py-1.5 rounded-md cursor-pointer disabled:opacity-50 transition-colors"
                            style={{ background: "var(--surface-2)", color: "var(--text-primary)" }}
                          >
                            {connecting === platform.provider ? "Connecting…" : "Connect"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setAddKeyFor(platform)}
                            className="text-sm font-semibold px-3 py-1.5 rounded-md cursor-pointer transition-colors"
                            style={{ background: "var(--surface-2)", color: "var(--text-primary)" }}
                          >
                            Add key
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2 pt-2">
        <h2 className="text-sm font-mono font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
          Saved credentials
        </h2>
        {items.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Nothing saved yet. Connect or add a key above.
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
  const [reconnecting, setReconnecting] = useState(false);

  // Composio-managed rows have no plaintext value to rotate (see the
  // hidden Rotate button below) — this is their equivalent: a fresh OAuth
  // round trip that updates THIS row in place (rotateComposioVaultCredential,
  // via vaultId in the request) rather than creating an unrelated new vault
  // row. Matters most once healthStatus is "invalid": before this existed,
  // an invalid Composio credential shared by several clients had no fix at
  // all — Delete refuses while any engagement is still linked, and
  // reconnecting via any one client's own CredentialRow only ever created
  // a separate new row that client alone got linked to.
  async function reconnect() {
    setReconnecting(true);
    setError(null);
    try {
      const res = await fetch("/api/composio/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: item.provider, vaultId: item.id, returnTo: "/dashboard/settings/apps" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't start reconnecting.");
        setReconnecting(false);
        return;
      }
      window.location.assign(data.redirectUrl);
    } catch {
      setError("Network error. Try again.");
      setReconnecting(false);
    }
  }

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
          <p className="text-[15px] font-medium truncate" style={{ color: "var(--text-primary)" }}>
            {item.label}
          </p>
          <p className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
            {item.provider} · {item.isComposioManaged ? "via Composio" : "manual key"} ·{" "}
            {item.healthStatus === "invalid" ? (
              <span style={{ color: "rgb(185,28,28)" }}>needs attention</span>
            ) : (
              item.healthStatus
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {item.isComposioManaged ? (
            <button
              type="button"
              onClick={reconnect}
              disabled={reconnecting}
              title="Reconnect"
              className="p-2 rounded-md cursor-pointer disabled:opacity-50"
              style={{ color: "var(--text-muted)" }}
            >
              <RotateCw size={14} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setRotating((r) => !r)}
              title="Rotate key"
              className="p-2 rounded-md cursor-pointer"
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
            className="p-2 rounded-md cursor-pointer disabled:opacity-50"
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
