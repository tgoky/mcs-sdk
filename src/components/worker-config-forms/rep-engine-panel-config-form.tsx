"use client";

// AI Engine Watch has no persisted settings to save — it already runs off
// whatever repIdentityGraphs.seedPanelPrompts and .activeEngines the
// Identity Setup bridge captured. What was actually missing wasn't
// configuration, it was a way to reach the one real action this skill
// already supports server-side (triggerEngineAdhocCheckForEngagement /
// POST rep-findings/trigger action=check_ai_engines) without going through
// Teammates chat — same shared trigger function either surface calls, so
// behavior can't drift between them.

import { useState } from "react";
import { InputField, TextAreaField } from "@/app/dashboard/engagements/new/form-fields";

export function RepEnginePanelConfigForm({
  engagementId,
  onCancel,
  cancelLabel = "Back to client",
}: {
  engagementId: string;
  onCancel: () => void;
  cancelLabel?: string;
}) {
  const [subject, setSubject] = useState("");
  const [question, setQuestion] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function runCheck() {
    setRunning(true);
    setError(null);
    setRunId(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/rep-findings/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "check_ai_engines", subject: subject.trim() || undefined, question: question.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't start the check.");
        return;
      }
      setRunId(data.runId ?? null);
      setMessage(data.message ?? "Check started.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-6 w-full max-w-3xl mx-auto px-4 py-6" style={{ color: "var(--text-secondary)" }}>
      <div className="pb-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <h1 className="text-lg font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
          AI Engine Watch
        </h1>
        <p className="text-xs font-normal mt-0.5" style={{ color: "var(--text-muted)" }}>
          The scheduled watch already runs off the prompts and engines chosen in Identity Setup. Nothing to tune
          here. This runs the same check on demand, right now, instead of waiting for the next scheduled pass.
        </p>
      </div>

      <InputField
        label="Subject (optional)"
        value={subject}
        onChange={setSubject}
        placeholder="Leave blank to use the operator name from Identity Setup"
        helpText="Who or what to ask the engines about."
      />
      <TextAreaField
        label="Question (optional)"
        value={question}
        onChange={setQuestion}
        placeholder="Leave blank to use the standard reputation-check prompt"
        rows={2}
        helpText="A specific question to ask ChatGPT, Claude, Perplexity, Grok, and Gemini right now."
      />

      {error && (
        <p className="text-xs font-mono font-semibold" style={{ color: "var(--error)" }}>
          ⚠ {error}
        </p>
      )}
      {message && !error && (
        <p className="text-xs font-mono font-semibold flex items-center gap-2" style={{ color: "var(--text-muted)" }}>
          ✓ {message}
          {runId && (
            <a href={`/dashboard/runs/${runId}`} className="underline underline-offset-2 hover:text-zinc-900 dark:hover:text-zinc-200">
              View run →
            </a>
          )}
        </p>
      )}

      <div className="flex justify-between pt-4 font-mono" style={{ borderTop: "1px solid var(--border)" }}>
        <button
          onClick={onCancel}
          className="px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 shadow-xs"
        >
          {cancelLabel}
        </button>
        <button
          onClick={runCheck}
          disabled={running}
          className="px-5 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer bg-zinc-900 hover:bg-zinc-800 text-zinc-50 dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900 disabled:opacity-40 disabled:cursor-not-allowed shadow-xs active:translate-y-px"
        >
          {running ? "Checking…" : "Check AI engines now"}
        </button>
      </div>
    </div>
  );
}
