"use client";

import { useState } from "react";
import { KeyRound, Eye, EyeOff, CheckCircle2, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";

interface CredentialField {
  provider: string;
  label: string;
  placeholder: string;
  howTo: string;
}

interface PlatformGroup {
  group: string;
  description: string;
  platforms: CredentialField[];
}

const PLATFORM_GROUPS: PlatformGroup[] = [
  {
    group: "Booking platforms",
    description: "Connect the calendar tool your clients use to book calls.",
    platforms: [
      {
        provider: "calendly",
        label: "Calendly",
        placeholder: "eyJhbGci...",
        howTo: "Calendly → Integrations → API & Webhooks → Personal Access Tokens → Create token",
      },
      {
        provider: "cal_com",
        label: "Cal.com",
        placeholder: "cal_live_...",
        howTo: "Cal.com → Settings → Developer → API Keys → Add",
      },
      {
        provider: "ghl_calendar",
        label: "GoHighLevel",
        placeholder: "eyJhbGci...",
        howTo: "GHL → Settings → API Keys → Create",
      },
    ],
  },
  {
    group: "Email & CRM",
    description: "Connect the tool you use to send emails and manage contacts.",
    platforms: [
      {
        provider: "klaviyo",
        label: "Klaviyo",
        placeholder: "pk_...",
        howTo: "Klaviyo → Settings → API Keys → Create Private API Key",
      },
      {
        provider: "hubspot",
        label: "HubSpot",
        placeholder: "pat-na1-...",
        howTo: "HubSpot → Settings → Integrations → Private Apps → Create → Access Token",
      },
      {
        provider: "activecampaign",
        label: "ActiveCampaign",
        placeholder: "abc123...",
        howTo: "ActiveCampaign → Settings → Developer → API Access → Copy key",
      },
    ],
  },
];

function PlatformSection({ group }: { group: PlatformGroup }) {
  const [expanded, setExpanded] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [engagementId, setEngagementId] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function save(provider: string) {
    const value = values[provider]?.trim();
    if (!value) {
      setErrors((e) => ({ ...e, [provider]: "Paste your key above before saving." }));
      return;
    }
    if (!engagementId.trim()) {
      setErrors((e) => ({ ...e, _eid: "Enter your account ID first." }));
      return;
    }

    setSaving(provider);
    setErrors((e) => ({ ...e, [provider]: "", _eid: "" }));

    try {
      const res = await fetch("/api/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          engagementId: engagementId.trim(),
          provider,
          value,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setErrors((e) => ({ ...e, [provider]: data.error ?? "Something went wrong." }));
      } else {
        setSaved((s) => new Set(s).add(provider));
        setValues((v) => ({ ...v, [provider]: "" }));
      }
    } catch {
      setErrors((e) => ({ ...e, [provider]: "Network error. Try again." }));
    } finally {
      setSaving(null);
    }
  }

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      {/* Group header */}
      <button
        className="w-full flex items-center justify-between px-5 py-4 text-left transition-colors"
        onClick={() => setExpanded((e) => !e)}
        style={{ background: "transparent" }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.background = "var(--surface-2)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = "transparent";
        }}
      >
        <div>
          <p className="text-sm" style={{ color: "var(--text-primary)", fontWeight: 600 }}>
            {group.group}
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            {group.description}
          </p>
        </div>
        {expanded ? (
          <ChevronUp size={16} style={{ color: "var(--text-muted)" }} />
        ) : (
          <ChevronDown size={16} style={{ color: "var(--text-muted)" }} />
        )}
      </button>

      {expanded && (
        <div style={{ borderTop: "1px solid var(--border)" }}>
          {/* Account ID field — shown once per group */}
          <div
            className="px-5 py-4"
            style={{
              borderBottom: "1px solid var(--border)",
              background: "var(--surface-2)",
            }}
          >
            <label
              className="block text-xs mb-1.5"
              style={{ color: "var(--text-primary)", fontWeight: 500 }}
            >
              Which account is this for?
            </label>
            <input
              className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
              value={engagementId}
              onChange={(e) => setEngagementId(e.target.value)}
              placeholder="e.g. eng_acme_corp_001"
            />
            {errors._eid && (
              <p className="text-xs mt-1" style={{ color: "var(--error)" }}>
                {errors._eid}
              </p>
            )}
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              Find this on your account setup page.
            </p>
          </div>

          {/* Platforms */}
          {group.platforms.map((platform, i) => {
            const isLast = i === group.platforms.length - 1;
            const isSaved = saved.has(platform.provider);

            return (
              <div
                key={platform.provider}
                className="px-5 py-4"
                style={{ borderBottom: isLast ? "none" : "1px solid var(--border)" }}
              >
                <div className="flex items-center justify-between mb-2">
                  <label
                    className="text-xs"
                    style={{ color: "var(--text-primary)", fontWeight: 500 }}
                  >
                    {platform.label} API key
                  </label>
                  {isSaved && (
                    <div className="flex items-center gap-1">
                      <CheckCircle2 size={12} style={{ color: "var(--success)" }} />
                      <span className="text-xs" style={{ color: "var(--success)" }}>
                        Saved
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 pr-8 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
                      type={visible[platform.provider] ? "text" : "password"}
                      value={values[platform.provider] ?? ""}
                      onChange={(e) =>
                        setValues((v) => ({ ...v, [platform.provider]: e.target.value }))
                      }
                      placeholder={platform.placeholder}
                    />
                    <button
                      className="absolute right-2.5 top-1/2 -translate-y-1/2"
                      onClick={() =>
                        setVisible((v) => ({
                          ...v,
                          [platform.provider]: !v[platform.provider],
                        }))
                      }
                      type="button"
                      title={visible[platform.provider] ? "Hide" : "Show"}
                    >
                      {visible[platform.provider] ? (
                        <EyeOff size={13} style={{ color: "var(--text-muted)" }} />
                      ) : (
                        <Eye size={13} style={{ color: "var(--text-muted)" }} />
                      )}
                    </button>
                  </div>
                  <button
                    onClick={() => save(platform.provider)}
                    disabled={saving === platform.provider}
                    className="px-4 py-2 text-sm rounded-md font-medium bg-zinc-100 text-zinc-950 hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
                  >
                    {saving === platform.provider ? "Saving…" : "Save"}
                  </button>
                </div>

                {errors[platform.provider] && (
                  <div className="flex items-center gap-1.5 mt-2">
                    <AlertCircle size={12} style={{ color: "var(--error)" }} />
                    <p className="text-xs" style={{ color: "var(--error)" }}>
                      {errors[platform.provider]}
                    </p>
                  </div>
                )}

                <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
                  {platform.howTo}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function CredentialsPage() {
  return (
    <div className="w-full space-y-6 px-6 py-6">
      <div>
        <h1
          className="text-xl"
          style={{ color: "var(--text-primary)", fontWeight: 700 }}
        >
          Connections
        </h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
          Paste your API keys here to connect your platforms. Keys are encrypted
          before storage — nobody can read them, including Mudd staff.
        </p>
      </div>

      <div
        className="flex items-start gap-3 p-4 rounded-xl"
        style={{
          background: "var(--accent-dim)",
          border: "1px solid rgba(99,102,241,0.2)",
        }}
      >
        <KeyRound
          size={16}
          style={{
            color: "var(--accent)",
            marginTop: "1px",
            flexShrink: 0,
          }}
          className="shrink-0"
        />
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Each key is encrypted with AES-256-GCM the moment you hit Save. We
          never store or log them in plain text.
        </p>
      </div>

      <div className="space-y-3">
        {PLATFORM_GROUPS.map((group) => (
          <PlatformSection key={group.group} group={group} />
        ))}
      </div>

      {/* Slack — different character, not a secret */}
      <div
        className="rounded-xl p-5 space-y-2"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <p
          className="text-sm"
          style={{ color: "var(--text-primary)", fontWeight: 600 }}
        >
          Slack webhook
        </p>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Your call briefs and alerts are delivered to a Slack channel of your
          choice. Set this up during your account setup — it lives on your
          engagement config, not here.
        </p>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          To add it: api.slack.com → Your Apps → Incoming Webhooks → Add New
          Webhook to Workspace
        </p>
      </div>
    </div>
  );
}