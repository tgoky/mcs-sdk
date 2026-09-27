import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { WORKER_REGISTRY, type WorkerId } from "@/lib/worker-registry";
import { loadSkillSettings, saveSkillSettings } from "@/lib/skill-settings/server";

export const runtime = "nodejs";
export const revalidate = 0;

async function owns(engagementId: string): Promise<boolean> {
  const session = await getSession();
  if (!session?.whopUserId) return false;
  const workspace = await getActiveWorkspace(session.whopUserId);
  const [row] = await db
    .select({ id: engagements.id })
    .from(engagements)
    .where(and(eq(engagements.engagementId, engagementId), eq(engagements.whopUserId, session.whopUserId), eq(engagements.workspaceId, workspace.workspaceId)))
    .limit(1);
  return Boolean(row);
}

const isWorker = (id: string): id is WorkerId => Object.prototype.hasOwnProperty.call(WORKER_REGISTRY, id);

/** One skill's own settings (lib/skill-settings), and what it runs on. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; skillId: string }> }) {
  const { id, skillId } = await params;
  if (!isWorker(skillId)) return NextResponse.json({ error: "Unknown skill." }, { status: 404 });
  if (!(await owns(id))) return NextResponse.json({ error: "Client not found." }, { status: 404 });
  const view = await loadSkillSettings(id, skillId);
  return view ? NextResponse.json(view) : NextResponse.json({ error: "Client not found." }, { status: 404 });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string; skillId: string }> }) {
  const { id, skillId } = await params;
  if (!isWorker(skillId)) return NextResponse.json({ error: "Unknown skill." }, { status: 404 });
  if (!(await owns(id))) return NextResponse.json({ error: "Client not found." }, { status: 404 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Send the settings as an object." }, { status: 400 });
  const result = await saveSkillSettings(id, skillId, body as Record<string, unknown>);
  return result.ok ? NextResponse.json(result) : NextResponse.json(result, { status: 400 });
}
