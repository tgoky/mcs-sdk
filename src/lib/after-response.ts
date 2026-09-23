// src/lib/after-response.ts
//
// Work to finish after a route has answered (next/server's after()), which
// must never be able to fail the request that scheduled it. Outside a
// request scope (a script, a test) it simply runs in the background.

import { after } from "next/server";

export function afterResponse(task: () => Promise<unknown>): void {
  const run = () => task().catch((err) => console.error("[after-response] background task failed:", err));
  try {
    after(run);
  } catch {
    void run();
  }
}
