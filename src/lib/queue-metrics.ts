// src/lib/queue-metrics.ts
//
// How long dispatched skill runs wait for a slot and how long they take,
// per skill and for the clients waiting longest. Read these before raising
// SKILL_RUNS_PER_CLIENT or upgrading the Inngest plan: a growing wait with
// short runs means not enough slots; long runs mean the work itself is slow.
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export interface SkillQueueMetrics {
  skillName: string;
  runs: number;
  waitP50Seconds: number | null;
  waitP95Seconds: number | null;
  runP50Seconds: number | null;
  runP95Seconds: number | null;
}

export interface ClientQueueMetrics {
  engagementId: string;
  runs: number;
  waitP95Seconds: number | null;
}

export async function getQueueMetrics(hours = 24): Promise<{ hours: number; bySkill: SkillQueueMetrics[]; slowestClients: ClientQueueMetrics[] }> {
  const since = sql`now() - make_interval(hours => ${hours})`;
  const bySkill = await db.execute<{ skill_name: string; runs: number; wait_p50: number | null; wait_p95: number | null; run_p50: number | null; run_p95: number | null }>(sql`
    select skill_name,
      count(*)::int as runs,
      percentile_cont(0.5) within group (order by queue_wait_ms) / 1000.0 as wait_p50,
      percentile_cont(0.95) within group (order by queue_wait_ms) / 1000.0 as wait_p95,
      percentile_cont(0.5) within group (order by extract(epoch from (completed_at - execution_started_at))) filter (where completed_at is not null) as run_p50,
      percentile_cont(0.95) within group (order by extract(epoch from (completed_at - execution_started_at))) filter (where completed_at is not null) as run_p95
    from skill_runs
    where execution_started_at is not null and started_at > ${since}
    group by skill_name
    order by wait_p95 desc nulls last`);
  const slowestClients = await db.execute<{ engagement_id: string; runs: number; wait_p95: number | null }>(sql`
    select engagement_id,
      count(*)::int as runs,
      percentile_cont(0.95) within group (order by queue_wait_ms) / 1000.0 as wait_p95
    from skill_runs
    where execution_started_at is not null and started_at > ${since}
    group by engagement_id
    order by wait_p95 desc nulls last
    limit 20`);

  const num = (v: unknown) => (v === null || v === undefined ? null : Math.round(Number(v) * 10) / 10);
  return {
    hours,
    bySkill: (bySkill as unknown as Array<Record<string, unknown>>).map((r) => ({
      skillName: String(r.skill_name),
      runs: Number(r.runs),
      waitP50Seconds: num(r.wait_p50),
      waitP95Seconds: num(r.wait_p95),
      runP50Seconds: num(r.run_p50),
      runP95Seconds: num(r.run_p95),
    })),
    slowestClients: (slowestClients as unknown as Array<Record<string, unknown>>).map((r) => ({
      engagementId: String(r.engagement_id),
      runs: Number(r.runs),
      waitP95Seconds: num(r.wait_p95),
    })),
  };
}
