// src/instrumentation.ts
//
// Next.js calls onRequestError for any error thrown while handling a
// request (API routes, server components, server actions, middleware),
// so every server crash reaches lib/error-reporting.ts, not just the
// ones some route remembered to catch.

import type { Instrumentation } from "next";

export function register() {}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  // Node runtime only: the reporter uses Node's crypto.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reportError } = await import("@/lib/error-reporting");
  const engagementId = /\/engagements\/([^/?#]+)/.exec(request.path)?.[1] ?? null;
  await reportError(error, {
    kind: "request",
    where: `${request.method} ${context.routePath}`,
    engagementId: engagementId ? decodeURIComponent(engagementId) : null,
    extra: { path: request.path, routeType: context.routeType, renderSource: "renderSource" in context ? context.renderSource : undefined },
  });
};
