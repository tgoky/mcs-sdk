// src/lib/provider-error.ts
//
// A short, human reason from a provider's error response: its own
// message/error field when the body is JSON, otherwise nothing. Raw bodies
// aren't echoed into errors, because those errors are shown to operators
// (notifications, run logs) and a raw body can be a wall of JSON or HTML.

export function providerErrorReason(raw: string): string {
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    for (const key of ["message", "error", "error_message", "detail"]) {
      const v = data?.[key];
      if (typeof v === "string" && v.trim()) return `: ${v.trim().slice(0, 200)}`;
      if (v && typeof v === "object" && typeof (v as { message?: unknown }).message === "string") {
        return `: ${String((v as { message: string }).message).trim().slice(0, 200)}`;
      }
    }
  } catch {
    // not JSON
  }
  return "";
}
