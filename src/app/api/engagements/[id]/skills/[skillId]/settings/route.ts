import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { WORKER_REGISTRY, type WorkerId } from "@/lib/worker-registry";
import { loadSkillSettings, saveSkillSettings, type SettingsContext } from "@/lib/skill-settings/server";

export const runtime = "nodejs";
export const revalidate = 0;

/** The caller's context when the client is theirs, else null. */
async function owns(req: Request, engagementId: string): Promise<SettingsContext | null> {
  const session = await getSession();
  if (!session?.whopUserId) return null;
  const workspace = await getActiveWorkspace(session.whopUserId);
  const [row] = await db
    .select({ id: engagements.id })
    .from(engagements)
    .where(and(eq(engagements.engagementId, engagementId), eq(engagements.whopUserId, session.whopUserId), eq(engagements.workspaceId, workspace.workspaceId)))
    .limit(1);
  if (!row) return null;
  return { origin: process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin, whopUserId: session.whopUserId, workspaceId: workspace.workspaceId };
}

const isWorker = (id: string): id is WorkerId => Object.prototype.hasOwnProperty.call(WORKER_REGISTRY, id);

/** One skill's own settings (lib/skill-settings), and what it runs on. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; skillId: string }> }) {
  const { id, skillId } = await params;
  if (!isWorker(skillId)) return NextResponse.json({ error: "Unknown skill." }, { status: 404 });
  const ctx = await owns(req, id);
  if (!ctx) return NextResponse.json({ error: "Client not found." }, { status: 404 });
  const view = await loadSkillSettings(id, skillId, ctx);
  return view ? NextResponse.json(view) : NextResponse.json({ error: "Client not found." }, { status: 404 });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string; skillId: string }> }) {
  const { id, skillId } = await params;
  if (!isWorker(skillId)) return NextResponse.json({ error: "Unknown skill." }, { status: 404 });
  const ctx = await owns(req, id);
  if (!ctx) return NextResponse.json({ error: "Client not found." }, { status: 404 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Send the settings as an object." }, { status: 400 });
  const result = await saveSkillSettings(id, skillId, body as Record<string, unknown>, ctx);
  return result.ok ? NextResponse.json(result) : NextResponse.json(result, { status: 400 });
}
