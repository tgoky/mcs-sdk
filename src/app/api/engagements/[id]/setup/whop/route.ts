import { NextResponse } from "next/server";
import { loadWhopSetupState } from "@/lib/whop-setup/state";
import { authorizeProductSetup } from "../showtime/access";

export const runtime = "nodejs";
export const revalidate = 0;

/** Everything Whop Agent's setup screen shows. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await authorizeProductSetup(id, "whop-agent");
  if (!access.ok) return access.response;
  const state = await loadWhopSetupState(id);
  if (!state) return NextResponse.json({ error: "Client not found." }, { status: 404 });
  return NextResponse.json(state);
}
