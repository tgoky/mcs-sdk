import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { reportError } from "@/lib/error-reporting";
import { rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * A page crash a signed-in person hit (the dashboard's error screens post
 * here), reported like any server error (lib/error-reporting.ts). Signed-in
 * only and rate limited, so it can't be used to flood the owner's alerts.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.whopUserId) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const limited = await rateLimitResponse(RATE_LIMITS.clientErrors, session.whopUserId);
  if (limited) return limited;

  const body = (await req.json().catch(() => ({}))) as { message?: unknown; name?: unknown; digest?: unknown; path?: unknown; stack?: unknown };
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : undefined);
  const path = text(body.path, 300) ?? "unknown page";
  await reportError(
    { name: text(body.name, 100) ?? "Error", message: text(body.message, 1000) ?? "(no message)", stack: text(body.stack, 8000) },
    {
      kind: "client",
      where: path.replace(/[?#].*$/, ""),
      engagementId: /\/engagements\/([^/?#]+)/.exec(path)?.[1] ?? null,
      extra: { digest: text(body.digest, 100), user: session.whopUserId },
    }
  );
  return new NextResponse(null, { status: 204 });
}
