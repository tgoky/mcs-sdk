// =============================================================================
// QUICK ACTIONS
//
// Thin fetch wrappers for the mutations exposed in the Live Executions /
// Queue "settings" action panel (src/components/action-panel.tsx). Every
// function here calls a real, already-existing API route — nothing here
// invents new backend behavior, it just gives the click-to-open panel a
// single consistent result shape to render busy/error state from.
// =============================================================================

export type QuickActionResult = { ok: true } | { ok: false; error: string };

async function parseError(res: Response, fallback: string): Promise<string> {
  if (res.status === 401) return "Your session expired — refresh the page and sign in again.";
  if (res.status === 403) return "You don't have permission to do that.";
  try {
    const data = await res.json();
    return typeof data?.error === "string" ? data.error : fallback;
  } catch {
    return fallback;
  }
}

async function post(url: string, body?: object): Promise<QuickActionResult> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) return { ok: false, error: await parseError(res, "That didn't go through — try again.") };
    return { ok: true };
  } catch {
    return { ok: false, error: "Network error — check your connection." };
  }
}

/** POST /api/skill-runs/[id]/cancel — only valid while a run is still "running". */
export function cancelSkillRun(runId: string): Promise<QuickActionResult> {
  return post(`/api/skill-runs/${runId}/cancel`);
}

/**
 * POST /api/skill-runs/trigger — manually fires a skill for a client.
 * Only "pre-call-read" and "leak-map" support manual triggers server-side;
 * everything else 422s with an explanation, which surfaces as errorText.
 */
export function triggerSkillRun(engagementId: string, skillName: string): Promise<QuickActionResult> {
  return post("/api/skill-runs/trigger", { engagementId, skillName });
}

/** POST /api/engagements/[id]/pause — stops every recurring automation for this client. */
export function pauseEngagement(engagementId: string, reason?: string): Promise<QuickActionResult> {
  return post(`/api/engagements/${engagementId}/pause`, { reason: reason ?? "Paused from quick actions" });
}

/** DELETE /api/engagements/[id]/pause — resumes a paused client's automations. */
export async function resumeEngagement(engagementId: string): Promise<QuickActionResult> {
  try {
    const res = await fetch(`/api/engagements/${engagementId}/pause`, { method: "DELETE" });
    if (!res.ok) return { ok: false, error: await parseError(res, "Failed to resume automations.") };
    return { ok: true };
  } catch {
    return { ok: false, error: "Network error — check your connection." };
  }
}

/** Clipboard copy, normalized to the same result shape as the network actions above. */
export async function copyToClipboard(text: string): Promise<QuickActionResult> {
  try {
    await navigator.clipboard.writeText(text);
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't copy — clipboard access was denied." };
  }
}
