import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  deleteVaultCredential,
  rotateVaultCredential,
  vaultCredentialBelongsToTenant,
} from "@/lib/credentials";

/** Body: { value?, label? } — rotates the secret and/or renames it. Every engagement linked via vaultId picks up a rotated value on its next run, no re-linking needed. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const owned = await vaultCredentialBelongsToTenant(id, session.whopUserId);
    if (!owned) {
      return NextResponse.json({ error: "Credential not found or access denied." }, { status: 404 });
    }

    const { value, label } = await request.json();
    if (value === undefined && label === undefined) {
      return NextResponse.json({ error: "Provide value and/or label to update." }, { status: 400 });
    }
    if (label !== undefined && (typeof label !== "string" || label.trim().length === 0)) {
      return NextResponse.json({ error: "label must be a non-empty string." }, { status: 400 });
    }

    await rotateVaultCredential(id, {
      plainValue: typeof value === "string" && value.length > 0 ? value : undefined,
      label: typeof label === "string" ? label.trim() : undefined,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[credential-vault/[id] PATCH]", err);
    return NextResponse.json({ error: "Failed to update credential." }, { status: 500 });
  }
}

/** Refuses to delete while any engagement is still linked — returns 409 with the list of engagement ids so the UI can tell the buyer exactly what to re-link first, instead of a vague "can't delete." */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const owned = await vaultCredentialBelongsToTenant(id, session.whopUserId);
    if (!owned) {
      return NextResponse.json({ error: "Credential not found or access denied." }, { status: 404 });
    }

    const result = await deleteVaultCredential(id);
    if (!result.ok) {
      return NextResponse.json(
        {
          error: `Still used by ${result.usedBy.length} client engagement${result.usedBy.length === 1 ? "" : "s"}. Re-link those to a different credential first.`,
          usedBy: result.usedBy,
        },
        { status: 409 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[credential-vault/[id] DELETE]", err);
    return NextResponse.json({ error: "Failed to delete credential." }, { status: 500 });
  }
}
