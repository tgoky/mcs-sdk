// src/lib/chat-status-queries.ts
//
// The "it's an assistant, not a run-once chat" capability — read-only
// status lookups so the model can answer "what's on today," "who
// cancelled," "how'd that last run go," "is anyone in an active
// recovery" without triggering anything. No side effects anywhere in
// this file on purpose: every function here is a plain SELECT, so
// there's no risk class to reason about the way there was for
// create_client or the credential-linking functions — worth building
// first, and worth keeping that way going forward.

import { db } from "@/lib/db";
import { bookingRoster, skillRuns, winBackEnrollments } from "@/models/schema";
import { and, eq, gte, lte, desc } from "drizzle-orm";

export async function getTodaysCalls(engagementId: string) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const rows = await db
    .select({
      prospectName: bookingRoster.prospectName,
      prospectEmail: bookingRoster.prospectEmail,
      callTime: bookingRoster.callTime,
      status: bookingRoster.status,
    })
    .from(bookingRoster)
    .where(and(eq(bookingRoster.engagementId, engagementId), gte(bookingRoster.callTime, startOfDay), lte(bookingRoster.callTime, endOfDay)))
    .orderBy(bookingRoster.callTime);

  return rows;
}

export async function getRecentCancellations(engagementId: string, sinceDays = 7) {
  const since = new Date();
  since.setDate(since.getDate() - sinceDays);

  const rows = await db
    .select({
      prospectName: bookingRoster.prospectName,
      prospectEmail: bookingRoster.prospectEmail,
      callTime: bookingRoster.callTime,
      updatedAt: bookingRoster.updatedAt,
    })
    .from(bookingRoster)
    .where(and(eq(bookingRoster.engagementId, engagementId), eq(bookingRoster.status, "cancelled"), gte(bookingRoster.updatedAt, since)))
    .orderBy(desc(bookingRoster.updatedAt))
    .limit(20);

  return rows;
}

export async function getRunHistory(engagementId: string, skillName?: string) {
  const rows = await db
    .select({
      skillName: skillRuns.skillName,
      status: skillRuns.status,
      startedAt: skillRuns.startedAt,
      completedAt: skillRuns.completedAt,
      errorMessage: skillRuns.errorMessage,
    })
    .from(skillRuns)
    .where(skillName ? and(eq(skillRuns.engagementId, engagementId), eq(skillRuns.skillName, skillName)) : eq(skillRuns.engagementId, engagementId))
    .orderBy(desc(skillRuns.startedAt))
    .limit(10);

  return rows;
}

export async function getActiveRecoveries(engagementId: string) {
  const rows = await db
    .select({
      prospectName: winBackEnrollments.prospectName,
      prospectEmail: winBackEnrollments.prospectEmail,
      enrolledAt: winBackEnrollments.enrolledAt,
      recoveryWindowDays: winBackEnrollments.recoveryWindowDays,
    })
    .from(winBackEnrollments)
    .where(and(eq(winBackEnrollments.engagementId, engagementId), eq(winBackEnrollments.status, "active")))
    .orderBy(desc(winBackEnrollments.enrolledAt));

  return rows;
}
