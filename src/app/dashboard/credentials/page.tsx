"use client";

import { useState } from "react";
import { KeyRound, Eye, EyeOff, CheckCircle2, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";

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
      {
        provider: "mailchimp",
        label: "Mailchimp",
        placeholder: "abc123...-us21",
        howTo: "Mailchimp → Account & billing → Extras → API keys → Create A Key",
      },
      {
        provider: "convertkit",
        label: "ConvertKit",
        placeholder: "ck_...",
        howTo: "ConvertKit → Settings → Advanced → API → Copy API Secret",
      },
    ],
  },
];

// Providers with a real, verified "test this key" endpoint wired up server-
// side (see VALIDATORS in src/app/api/credentials/test/route.ts). Only
// these get a "Test connection" button — showing that button for a
// provider we can't actually validate would be a lie about what the
// platform can confirm.
const TESTABLE_PROVIDERS = new Set(["calendly", "cal_com", "mailchimp", "convertkit", "smtp"]);

function PlatformSection({ group }: { group: PlatformGroup }) {
  const [expanded, setExpanded] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [engagementId, setEngagementId] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; message: string }>>({});

  async function testConnection(provider: string) {
    if (!engagementId.trim()) {
      setErrors((e) => ({ ...e, _eid: "Enter your account ID first." }));
      return;
    }
    setTesting(provider);
    setTestResult((r) => ({ ...r, [provider]: undefined as any }));

    try {
      const res = await fetch("/api/credentials/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ engagementId: engagementId.trim(), provider }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTestResult((r) => ({ ...r, [provider]: { ok: false, message: data.error ?? "Test failed." } }));
      } else if (data.status === "ok") {
        setTestResult((r) => ({ ...r, [provider]: { ok: true, message: "Connected — key is valid." } }));
      } else {
        setTestResult((r) => ({ ...r, [provider]: { ok: false, message: data.error ?? "Key was rejected." } }));
      }
    } catch {
      setTestResult((r) => ({ ...r, [provider]: { ok: false, message: "Network error. Try again." } }));
    } finally {
      setTesting(null);
    }
  }

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
      className="rounded-xl overflow-hidden transition-colors duration-200"
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
              className="w-full bg-white/40 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-900 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-600 transition-colors"
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
                      className="w-full bg-white/40 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-md px-3 py-2 pr-8 text-sm text-zinc-900 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-600 transition-colors"
                      type={visible[platform.provider] ? "text" : "password"}
                      value={values[platform.provider] ?? ""}
                      onChange={(e) =>
                        setValues((v) => ({ ...v, [platform.provider]: e.target.value }))
                      }
                      placeholder={platform.placeholder}
                    />
                    <button
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer"
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
                    className="px-4 py-2 text-sm rounded-md font-medium bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0 cursor-pointer font-mono text-xs"
                  >
                    {saving === platform.provider ? "Saving…" : "Save"}
                  </button>
                  {TESTABLE_PROVIDERS.has(platform.provider) && (
                    <button
                      onClick={() => testConnection(platform.provider)}
                      disabled={testing === platform.provider}
                      title="Confirms the saved key still works, without waiting for the daily check"
                      className="px-3 py-2 text-sm rounded-md font-medium border border-zinc-300 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0 cursor-pointer font-mono text-xs"
                    >
                      {testing === platform.provider ? "Testing…" : "Test"}
                    </button>
                  )}
                </div>

                {testResult[platform.provider] && (
                  <div className="flex items-center gap-1.5 mt-2">
                    {testResult[platform.provider].ok ? (
                      <CheckCircle2 size={12} style={{ color: "var(--success)" }} />
                    ) : (
                      <AlertCircle size={12} style={{ color: "var(--error)" }} />
                    )}
                    <p
                      className="text-xs"
                      style={{ color: testResult[platform.provider].ok ? "var(--success)" : "var(--error)" }}
                    >
                      {testResult[platform.provider].message}
                    </p>
                  </div>
                )}

                {errors[platform.provider] && (
                  <div className="flex items-center gap-1.5 mt-2">
                    <AlertCircle size={12} style={{ color: "var(--error)" }} />
                    <p className="text-xs" style={{ color: "var(--error)" }}>
                      {errors[platform.provider]}
                    </p>
                  </div>
                )}

                <p className="text-xs mt-2 font-mono opacity-80" style={{ color: "var(--text-muted)" }}>
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

/**
 * SMTP is the one connector whose credential isn't a single string — it's
 * host/port/secure/username/password/fromAddress bundled together. Rather
 * than adding schema columns for it, the whole config is JSON-encoded and
 * stored through the exact same generic credential blob every other
 * provider uses (see storeCredential/resolveCredential) — this card just
 * builds that JSON string before posting to the same /api/credentials
 * and /api/credentials/test endpoints as everything above.
 */
function SmtpCredentialCard() {
  const [expanded, setExpanded] = useState(false);
  const [engagementId, setEngagementId] = useState("");
  const [config, setConfig] = useState({
    host: "",
    port: "587",
    secure: false,
    username: "",
    password: "",
    fromAddress: "",
    fromName: "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  function set<K extends keyof typeof config>(key: K, value: (typeof config)[K]) {
    setConfig((c) => ({ ...c, [key]: value }));
    setSaved(false);
  }

  const required: (keyof typeof config)[] = ["host", "port", "username", "password", "fromAddress"];
  const isComplete = required.every((k) => String(config[k]).trim().length > 0);

  async function save() {
    if (!isComplete) {
      setError("Fill in host, port, username, password, and from address before saving.");
      return;
    }
    if (!engagementId.trim()) {
      setError("Enter your account ID first.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const value = JSON.stringify({ ...config, port: Number(config.port) });
      const res = await fetch("/api/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ engagementId: engagementId.trim(), provider: "smtp", value }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Something went wrong.");
      } else {
        setSaved(true);
      }
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    if (!engagementId.trim()) {
      setError("Enter your account ID first.");
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/credentials/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ engagementId: engagementId.trim(), provider: "smtp" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTestResult({ ok: false, message: data.error ?? "Test failed." });
      } else if (data.status === "ok") {
        setTestResult({ ok: true, message: "Connected — SMTP credentials work." });
      } else {
        setTestResult({ ok: false, message: data.error ?? "Credentials were rejected." });
      }
    } catch {
      setTestResult({ ok: false, message: "Network error. Try again." });
    } finally {
      setTesting(false);
    }
  }

  const inputClass =
    "w-full bg-white/40 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-900 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-600 transition-colors";

  return (
    <div
      className="rounded-xl overflow-hidden transition-colors duration-200"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
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
            Custom SMTP
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            Direct-send win-back email for buyers on a bespoke email setup, no ESP required.
          </p>
        </div>
        {expanded ? (
          <ChevronUp size={16} style={{ color: "var(--text-muted)" }} />
        ) : (
          <ChevronDown size={16} style={{ color: "var(--text-muted)" }} />
        )}
      </button>

      {expanded && (
        <div className="px-5 py-4 space-y-3" style={{ borderTop: "1px solid var(--border)" }}>
          <div>
            <label className="block text-xs mb-1.5" style={{ color: "var(--text-primary)", fontWeight: 500 }}>
              Which account is this for?
            </label>
            <input
              className={inputClass}
              value={engagementId}
              onChange={(e) => setEngagementId(e.target.value)}
              placeholder="e.g. eng_acme_corp_001"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs mb-1.5" style={{ color: "var(--text-primary)", fontWeight: 500 }}>
                Host
              </label>
              <input className={inputClass} value={config.host} onChange={(e) => set("host", e.target.value)} placeholder="smtp.yourprovider.com" />
            </div>
            <div>
              <label className="block text-xs mb-1.5" style={{ color: "var(--text-primary)", fontWeight: 500 }}>
                Port
              </label>
              <input className={inputClass} value={config.port} onChange={(e) => set("port", e.target.value)} placeholder="587" />
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 text-xs" style={{ color: "var(--text-primary)", fontWeight: 500 }}>
              <input type="checkbox" checked={config.secure} onChange={(e) => set("secure", e.target.checked)} />
              Use implicit TLS (usually port 465). Leave unchecked for STARTTLS on 587.
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs mb-1.5" style={{ color: "var(--text-primary)", fontWeight: 500 }}>
                Username
              </label>
              <input className={inputClass} value={config.username} onChange={(e) => set("username", e.target.value)} placeholder="mailer@yourdomain.com" />
            </div>
            <div>
              <label className="block text-xs mb-1.5" style={{ color: "var(--text-primary)", fontWeight: 500 }}>
                Password
              </label>
              <input className={inputClass} type="password" value={config.password} onChange={(e) => set("password", e.target.value)} placeholder="••••••••" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs mb-1.5" style={{ color: "var(--text-primary)", fontWeight: 500 }}>
                From address
              </label>
              <input className={inputClass} value={config.fromAddress} onChange={(e) => set("fromAddress", e.target.value)} placeholder="hello@yourdomain.com" />
            </div>
            <div>
              <label className="block text-xs mb-1.5" style={{ color: "var(--text-primary)", fontWeight: 500 }}>
                From name (optional)
              </label>
              <input className={inputClass} value={config.fromName} onChange={(e) => set("fromName", e.target.value)} placeholder="Your Company" />
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-2 text-sm rounded-md font-medium bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0 cursor-pointer font-mono text-xs"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              onClick={test}
              disabled={testing}
              title="Confirms the saved SMTP credentials actually connect, without waiting for the daily check"
              className="px-3 py-2 text-sm rounded-md font-medium border border-zinc-300 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0 cursor-pointer font-mono text-xs"
            >
              {testing ? "Testing…" : "Test"}
            </button>
            {saved && (
              <div className="flex items-center gap-1 self-center ml-1">
                <CheckCircle2 size={12} style={{ color: "var(--success)" }} />
                <span className="text-xs" style={{ color: "var(--success)" }}>Saved</span>
              </div>
            )}
          </div>

          {testResult && (
            <div className="flex items-center gap-1.5">
              {testResult.ok ? (
                <CheckCircle2 size={12} style={{ color: "var(--success)" }} />
              ) : (
                <AlertCircle size={12} style={{ color: "var(--error)" }} />
              )}
              <p className="text-xs" style={{ color: testResult.ok ? "var(--success)" : "var(--error)" }}>
                {testResult.message}
              </p>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-1.5">
              <AlertCircle size={12} style={{ color: "var(--error)" }} />
              <p className="text-xs" style={{ color: "var(--error)" }}>{error}</p>
            </div>
          )}

          <p className="text-xs mt-2 font-mono opacity-80" style={{ color: "var(--text-muted)" }}>
            Only runs the Win-Back recovery email cadence today — SMTP has no Pile-On pre-call content yet.
          </p>
        </div>
      )}
    </div>
  );
}

export default function CredentialsPage() {
  return (
    <div className="w-full space-y-6 px-6 py-6 transition-colors duration-200">
      <div>
        <h1
          className="text-xl tracking-tight"
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
        <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          Each key is encrypted with AES-256-GCM the moment you hit Save. We
          never store or log them in plain text.
        </p>
      </div>

      <div className="space-y-3">
        {PLATFORM_GROUPS.map((group) => (
          <PlatformSection key={group.group} group={group} />
        ))}
        <SmtpCredentialCard />
      </div>

      {/* Slack — different character, not a secret */}
      <div
        className="rounded-xl p-5 space-y-2 transition-colors duration-200"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <p
          className="text-sm"
          style={{ color: "var(--text-primary)", fontWeight: 600 }}
        >
          Slack webhook
        </p>
        <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          Your call briefs and alerts are delivered to a Slack channel of your
          choice. Set this up during your account setup — it lives on your
          engagement config, not here.
        </p>
        <p className="text-xs font-mono opacity-80" style={{ color: "var(--text-muted)" }}>
          To add it: api.slack.com → Your Apps → Incoming Webhooks → Add New
          Webhook to Workspace
        </p>
      </div>
    </div>
  );
}