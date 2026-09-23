import { NextResponse } from "next/server";
import { parseWhopSetup, saveWhopSetup } from "@/lib/whop-setup/save";
import { loadWhopConnection } from "@/lib/whop-setup/state";
import { authorizeProductSetup } from "../../showtime/access";

export const runtime = "nodejs";
export const revalidate = 0;

/** Saves the reviewed Whop Agent setup. Creates or updates the agent's
 * one webhook; writes nothing else to Whop. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await authorizeProductSetup(id, "whop-agent", { requireInstalled: true });
  if (!access.ok) return access.response;
  if (!(await loadWhopConnection(id))) return NextResponse.json({ error: "Connect the Whop account first." }, { status: 400 });

  const input = parseWhopSetup(await req.json().catch(() => null));
  if ("error" in input) return NextResponse.json({ error: input.error }, { status: 400 });
  try {
    const result = await saveWhopSetup(id, input);
    if ("error" in result) return NextResponse.json(result, { status: 400 });
    return NextResponse.json(result);
  } catch (err) {
    console.error(`[setup/whop/save] ${id}:`, err);
    return NextResponse.json({ error: "Couldn't save. Try again." }, { status: 500 });
  }
}
