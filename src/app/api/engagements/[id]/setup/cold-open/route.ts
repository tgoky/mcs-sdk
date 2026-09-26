import { NextResponse } from "next/server";
import { loadColdOpenSetupState } from "@/lib/cold-open-setup/state";
import { authorizeProductSetup } from "../showtime/access";
import { webhookUrl } from "@/lib/webhook-url-token";

export const runtime = "nodejs";
export const revalidate = 0;

/** Everything the Cold Open setup screen shows. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await authorizeProductSetup(id, "cold-open");
  if (!access.ok) return access.response;
  const state = await loadColdOpenSetupState(id, access.workspaceId);
  if (!state) return NextResponse.json({ error: "Client not found." }, { status: 404 });
  const replyWebhookUrl = webhookUrl(process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin, "cold-open-replies", id);
  return NextResponse.json({ ...state, replyWebhookUrl });
}
