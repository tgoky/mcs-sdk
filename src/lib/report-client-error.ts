// src/lib/report-client-error.ts
//
// Browser side of api/errors/client: sends a page crash so the owner hears
// about it. Fire and forget; a failed report never shows the person
// another error.

export function reportClientError(error: Error & { digest?: string }): void {
  try {
    void fetch("/api/errors/client", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: error.name, message: error.message, digest: error.digest, stack: error.stack, path: window.location.pathname }),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Reporting must never throw.
  }
}
