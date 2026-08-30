import { Users } from "lucide-react";
import { TeammatesChat } from "./teammates-chat";

export default function TeammatesPage() {
  return (
    <div className="flex flex-col h-full w-full mx-auto tracking-tight antialiased font-sans text-zinc-600 dark:text-zinc-400">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 border-b border-zinc-200 dark:border-zinc-800/80 pb-3 mb-3">
        <span
          className="flex items-center justify-center w-8 h-8 rounded-full shrink-0"
          style={{ background: "var(--accent-dim)", color: "var(--text-secondary)" }}
        >
          <Users size={16} />
        </span>
        <div className="space-y-0.5">
          <h1 className="text-base font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">Teammates</h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Ask for a Call Brief or a Leak Map run in plain language — it&apos;ll ask before it guesses which
            client you mean.
          </p>
        </div>
      </div>

      {/* Main Workspace Frame */}
      <div className="flex-1 min-h-0 w-full overflow-hidden">
        <TeammatesChat />
      </div>
    </div>
  );
}