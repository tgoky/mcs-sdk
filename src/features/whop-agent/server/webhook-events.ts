// src/features/whop-agent/server/webhook-events.ts

/** The events the agent's one subscription should carry: `events`, plus
 * any it already carries that `keep` says aren't the caller's to drop. */
export function mergeWebhookEvents(current: string[], events: string[], keep: (event: string) => boolean = () => false): string[] {
  return [...new Set([...events, ...current.filter(keep)])].sort();
}
