import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getActiveWorkspace, installPackageInWorkspace, uninstallPackageInWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";

/** Install from the Library into the current workspace. The helper performs
 * both product allow-listing and workspace ownership checks. */
export async function POST(_request: Request, { params }: { params: Promise<{ packageId: string }> }) {
  const session = await getSession();
  if (!session.whopUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { packageId } = await params;
  const workspace = await getActiveWorkspace(session.whopUserId);
  const result = await installPackageInWorkspace(session.whopUserId, workspace.workspaceId, packageId);

  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, packageId });
}

/** Uninstall from the Library — see uninstallPackageInWorkspace's own
 * header for why this also explicitly disables the product's skills for
 * this workspace's engagement(s), not just the package entitlement row. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ packageId: string }> }) {
  const session = await getSession();
  if (!session.whopUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { packageId } = await params;
  const workspace = await getActiveWorkspace(session.whopUserId);
  const result = await uninstallPackageInWorkspace(session.whopUserId, workspace.workspaceId, packageId);

  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, packageId });
}
