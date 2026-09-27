"use client";

// src/app/dashboard/engagements/[id]/header-tools.tsx
//
// The client's tools at the top of their page, as logos instead of name
// tags, with the offer's traffic beside them. A logo opens its own card:
// the connected account, another saved account, sign in again, or
// disconnect. "Change" opens Show Rate Setup's tool rows beside the page
// to pick a different tool (which sets Showtime up again).

import { useRouter } from "next/navigation";
import { ArrowLeftRight } from "lucide-react";
import { ToolAvatar, type ToolActions } from "@/components/product-setup/tool-avatar";
import type { SetupTool } from "@/lib/showtime-setup/catalog";
import type { ToolState } from "@/lib/showtime-setup/types";
import { useOpenSkillSettings } from "./skill-configure-menu";
import { useSkillPane } from "@/components/skill-settings/skill-pane-context";

export interface HeaderTool {
  role: string;
  tool: SetupTool;
  state: ToolState | undefined;
}

const TOOL_PATHS = ["booking_platform", "email_platform", "hosting_platform"];

export function HeaderTools({ engagementId, buyer, tools, trafficTemp }: { engagementId: string; buyer: string; tools: HeaderTool[]; trafficTemp: string | null }) {
  const router = useRouter();
  const pane = useSkillPane();
  const openSettings = useOpenSkillSettings();
  const url = `/api/engagements/${encodeURIComponent(engagementId)}/setup/showtime/connect`;
  const post = async (body: unknown) => {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return json.error ?? "Something went wrong. Try again.";
    router.refresh();
    return null;
  };
  const actions: ToolActions = {
    useSaved: (tool, vaultId) => post({ provider: tool.provider, vaultId }),
    connectKey: (tool, value, extra) => post({ provider: tool.provider, value, ...extra }),
    signIn: async (tool) => {
      const res = await fetch("/api/composio/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: tool.provider, returnTo: window.location.pathname, engagementId }),
      });
      const json = (await res.json().catch(() => ({}))) as { redirectUrl?: string; error?: string };
      if (!res.ok || !json.redirectUrl) return json.error ?? `Couldn't start signing in to ${tool.label}.`;
      window.location.assign(json.redirectUrl);
      return null;
    },
    disconnect: (tool) => post({ provider: tool.provider, disconnect: true }),
    choose: () => undefined,
    setExtra: (tool, extras) => post({ provider: tool.provider, ...extras }),
  };

  if (tools.length === 0 && !trafficTemp) return null;
  const changeTools = () => {
    if (pane && window.matchMedia("(min-width: 768px)").matches) pane.open({ engagementId, skillId: "pin-down", only: TOOL_PATHS });
    else openSettings(engagementId, "pin-down");
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {tools.map((t) => (
        <ToolAvatar key={`${t.role}:${t.tool.provider}`} tool={t.tool} state={t.state} selected buyer={buyer} actions={actions} size={30} hideLabel title={`${t.role}: ${t.tool.label}`} />
      ))}
      {tools.length > 0 && (
        <button
          type="button"
          onClick={changeTools}
          className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100 cursor-pointer"
          title="Pick different tools"
        >
          <ArrowLeftRight className="h-3 w-3" /> Change
        </button>
      )}
      {trafficTemp && (
        <span className="ml-1 rounded-md border border-border bg-zinc-100 px-2 py-0.5 text-[12px] capitalize text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400" title="How the offer's leads usually arrive">
          {trafficTemp} traffic
        </span>
      )}
    </div>
  );
}
