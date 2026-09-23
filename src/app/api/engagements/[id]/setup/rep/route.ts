import { NextResponse } from "next/server";
import { loadRepSetupState } from "@/lib/rep-setup/state";
import { authorizeProductSetup } from "../showtime/access";

export const runtime = "nodejs";
export const revalidate = 0;

/** Everything the Reputation Manager setup screen shows. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await authorizeProductSetup(id, "reputation-manager");
  if (!access.ok) return access.response;
  const state = await loadRepSetupState(id, access.workspaceId);
  if (!state) return NextResponse.json({ error: "Client not found." }, { status: 404 });
  return NextResponse.json(state);
}
