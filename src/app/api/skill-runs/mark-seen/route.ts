import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { markExecutionsSeen } from "@/lib/run-log";

export async function POST() {
  const session = await getSession();
  if (!session?.whopUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await markExecutionsSeen(session.whopUserId);
  return NextResponse.json({ ok: true });
}