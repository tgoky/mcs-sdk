"use client";

import { useState } from "react";

interface CredentialField {
  provider: string;
  label: string;
  placeholder: string;
  helpText: string;
}

const CREDENTIAL_FIELDS: CredentialField[] = [
  {
    provider: "calendly",
    label: "Calendly Personal Access Token",
    placeholder: "eyJhbGciOi...",
    helpText: "From Calendly → Integrations → API & Webhooks → Personal Access Tokens",
  },
  {
    provider: "cal_com",
    label: "Cal.com API Key",
    placeholder: "cal_live_...",
    helpText: "From Cal.com → Settings → Developer → API Keys",
  },
  {
    provider: "ghl_calendar",
    label: "GHL API Key",
    placeholder: "eyJhbGciOi...",
    helpText: "From GoHighLevel → Settings → API Keys",
  },
  {
    provider: "klaviyo",
    label: "Klaviyo Private API Key",
    placeholder: "pk_...",
    helpText: "From Klaviyo → Settings → API Keys → Create Private API Key",
  },
  {
    provider: "hubspot",
    label: "HubSpot Access Token",
    placeholder: "pat-na1-...",
    helpText: "From HubSpot → Settings → Private App → Access Token",
  },
  {
    provider: "activecampaign",
    label: "ActiveCampaign API Key",
    placeholder: "abc123...",
    helpText: "From ActiveCampaign → Settings → Developer → API Access",
  },
];

export default function CredentialsVaultPage() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [engagementId, setEngagementId] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function saveCredential(field: CredentialField) {
    const value = values[field.provider];
    if (!value?.trim()) {
      setErrors((e) => ({ ...e, [field.provider]: "Value cannot be empty." }));
      return;
    }
    if (!engagementId.trim()) {
      setErrors((e) => ({ ...e, global: "Enter your engagement ID first." }));
      return;
    }

    setSaving(field.provider);
    setErrors((e) => ({ ...e, [field.provider]: "" }));

    try {
      const res = await fetch("/api/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          engagementId,
          provider: field.provider,
          value: value.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setErrors((e) => ({ ...e, [field.provider]: data.error ?? "Save failed." }));
      } else {
        setSaved((s) => new Set(s).add(field.provider));
        setValues((v) => ({ ...v, [field.provider]: "" }));
      }
    } catch {
      setErrors((e) => ({ ...e, [field.provider]: "Network error." }));
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <div className="pb-2 border-b border-zinc-900">
        <h1 className="text-xl font-medium tracking-tighter text-zinc-100">
          Credentials Vault
        </h1>
        <p className="text-[11px] font-light text-zinc-500 mt-1">
          API keys are encrypted with AES-256-GCM before storage. They are
          never logged or transmitted in plaintext.
        </p>
      </div>

      {/* Engagement ID */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
          Engagement ID
        </label>
        <input
          type="text"
          value={engagementId}
          onChange={(e) => setEngagementId(e.target.value)}
          placeholder="eng_acme_corp_001"
          className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-xs font-mono text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-zinc-600"
        />
        {errors.global && (
          <p className="text-[10px] text-rose-400 font-mono">{errors.global}</p>
        )}
        <p className="text-[10px] text-zinc-600">
          Find this in your engagement URL or on the Active Engagements page.
        </p>
      </div>

      {/* Credential fields */}
      <div className="space-y-4">
        {CREDENTIAL_FIELDS.map((field) => (
          <div
            key={field.provider}
            className="rounded border border-zinc-900 bg-zinc-950/40 p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-zinc-300">
                {field.label}
              </label>
              {saved.has(field.provider) && (
                <span className="text-[9px] font-mono text-emerald-400 bg-emerald-500/5 border border-emerald-500/10 px-1.5 py-0.5 rounded">
                  SAVED
                </span>
              )}
            </div>

            <div className="flex gap-2">
              <input
                type="password"
                value={values[field.provider] ?? ""}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [field.provider]: e.target.value }))
                }
                placeholder={field.placeholder}
                className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-xs font-mono text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-zinc-600"
              />
              <button
                onClick={() => saveCredential(field)}
                disabled={saving === field.provider}
                className="px-3 py-2 text-[10px] font-mono font-medium bg-zinc-100 text-zinc-950 rounded hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving === field.provider ? "SAVING..." : "SAVE"}
              </button>
            </div>

            {errors[field.provider] && (
              <p className="text-[10px] text-rose-400 font-mono">
                {errors[field.provider]}
              </p>
            )}

            <p className="text-[10px] text-zinc-600">{field.helpText}</p>
          </div>
        ))}
      </div>

      {/* Slack webhook — not a secret, stored on stack directly */}
      <div className="rounded border border-zinc-900 bg-zinc-950/40 p-4 space-y-3">
        <label className="text-xs font-medium text-zinc-300">
          Slack Incoming Webhook URL
        </label>
        <p className="text-[10px] text-zinc-600">
          Pre-call briefs and alert notifications are delivered here. Set this
          during Pin-Down onboarding — it lives on your engagement config, not
          in the encrypted vault.
        </p>
        <p className="text-[10px] font-mono text-zinc-500">
          From: api.slack.com → Your Apps → Incoming Webhooks → Add New
          Webhook
        </p>
      </div>
    </div>
  );
}