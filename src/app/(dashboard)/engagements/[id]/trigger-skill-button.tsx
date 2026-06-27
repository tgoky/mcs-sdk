"use client";

import { useState } from "react";

export function TriggerSkillButton({
  label,
  endpoint,
}: {
  label: string;
  endpoint: string;
}) {
  const [state, setState] = useState<"idle" | "running" | "done" | "error">(
    "idle"
  );
  const [result, setResult] = useState<string | null>(null);

  async function trigger() {
    setState("running");
    setResult(null);
    try {
      const res = await fetch(endpoint, { method: "GET" });
      const data = await res.json();
      if (res.ok) {
        setState("done");
        setResult(
          data.briefsDelivered !== undefined
            ? `${data.briefsDelivered} brief(s) delivered`
            : "Completed"
        );
      } else {
        setState("error");
        setResult(data.error ?? "Unknown error");
      }
    } catch (e: any) {
      setState("error");
      setResult(e.message);
    }
  }

  return (
    <div className="space-y-1">
      <button
        onClick={trigger}
        disabled={state === "running"}
        className="w-full text-left px-3 py-2 text-[10px] font-mono font-medium rounded border border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
      >
        {state === "running" ? "RUNNING..." : label.toUpperCase()}
      </button>
      {result && (
        <p
          className={`text-[10px] font-mono px-1 ${
            state === "error" ? "text-rose-400" : "text-emerald-400"
          }`}
        >
          {result}
        </p>
      )}
    </div>
  );
}
