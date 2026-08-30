// src/lib/chat-threads.ts
//
// Persistence for Teammates chat threads. Extracted as its own module
// (rather than inlined in the route) so the eventual thread-list rail and
// the notify.ts fourth channel can both read/append without importing an
// API route handler — same reasoning as skill-trigger.ts being pulled out
// of its route.

import { db } from "@/lib/db";
import { chatThreads, chatMessages, type ChatMessageContentBlock } from "@/models/schema";
import { and, eq, asc } from "drizzle-orm";
import type { ClaudeMessage } from "@/lib/llm";
import crypto from "crypto";

const TITLE_MAX_LENGTH = 48;

export function deriveThreadTitle(firstUserText: string): string {
  const trimmed = firstUserText.trim().replace(/\s+/g, " ");
  if (trimmed.length <= TITLE_MAX_LENGTH) return trimmed || "New conversation";
  return `${trimmed.slice(0, TITLE_MAX_LENGTH - 1).trimEnd()}…`;
}

// IDs generated client-side and inserted plainly, no .returning() —
// matches startRun's exact convention in run-log.ts. Nothing else in
// this codebase relies on RETURNING against the Supabase pooler
// connection db.ts uses, so this doesn't introduce a new dependency on
// it working under pgbouncer's transaction-pooling mode.
export async function createThread(opts: {
  whopUserId: string;
  workspaceId: string;
  engagementId?: string | null;
  firstUserText: string;
}) {
  const id = crypto.randomUUID();
  const title = deriveThreadTitle(opts.firstUserText);
  await db.insert(chatThreads).values({
    id,
    whopUserId: opts.whopUserId,
    workspaceId: opts.workspaceId,
    engagementId: opts.engagementId ?? null,
    title,
  });
  return { id, title };
}

// Ownership check on every read/write — a threadId is opaque to the
// client, so nothing here trusts that a threadId belongs to the caller's
// workspace without verifying it against the DB first.
export async function getOwnedThread(threadId: string, workspaceId: string) {
  const [thread] = await db
    .select()
    .from(chatThreads)
    .where(and(eq(chatThreads.id, threadId), eq(chatThreads.workspaceId, workspaceId)))
    .limit(1);
  return thread ?? null;
}

export async function appendMessage(opts: {
  threadId: string;
  role: "user" | "assistant";
  kind?: "text" | "internal";
  rawContent: string | ChatMessageContentBlock[];
  displayText?: string | null;
  toolCalls?: { name: string; ok: boolean; message: string }[] | null;
  links?: { label: string; href: string }[] | null;
}) {
  const id = crypto.randomUUID();
  await db.insert(chatMessages).values({
    id,
    threadId: opts.threadId,
    role: opts.role,
    kind: opts.kind ?? "text",
    rawContent: opts.rawContent,
    displayText: opts.displayText ?? null,
    toolCalls: opts.toolCalls ?? null,
    links: opts.links ?? null,
  });

  // Bumping lastMessageAt on every append (not just "text" turns) keeps a
  // thread whose latest activity was a tool-result exchange from looking
  // stale in the eventual rail's sort order.
  await db.update(chatThreads).set({ lastMessageAt: new Date() }).where(eq(chatThreads.id, opts.threadId));

  return { id };
}

// Reconstructs exactly what callClaudeWithTools needs to continue this
// conversation — every row, tool_result turns included, in creation order.
export async function loadThreadForModel(threadId: string): Promise<ClaudeMessage[]> {
  const rows = await db
    .select({ role: chatMessages.role, rawContent: chatMessages.rawContent })
    .from(chatMessages)
    .where(eq(chatMessages.threadId, threadId))
    .orderBy(asc(chatMessages.createdAt));

  return rows.map((r) => ({ role: r.role as "user" | "assistant", content: r.rawContent as string | ChatMessageContentBlock[] }));
}

// The display-only shape for reloading the UI — skips tool_result rows,
// which never had a bubble to begin with.
export async function loadThreadForDisplay(threadId: string) {
  const rows = await db
    .select({
      role: chatMessages.role,
      displayText: chatMessages.displayText,
      toolCalls: chatMessages.toolCalls,
      links: chatMessages.links,
      createdAt: chatMessages.createdAt,
    })
    .from(chatMessages)
    .where(and(eq(chatMessages.threadId, threadId), eq(chatMessages.kind, "text")))
    .orderBy(asc(chatMessages.createdAt));

  return rows.map((r) => ({
    role: r.role as "user" | "assistant",
    content: r.displayText ?? "",
    toolCalls: r.toolCalls ?? [],
    links: r.links ?? [],
  }));
}
