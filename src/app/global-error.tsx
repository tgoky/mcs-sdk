"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/report-client-error";

/**
 * Last-resort screen for a crash in the root layout itself, which no other
 * error screen can catch. Replaces the whole document, so it brings its
 * own <html> and <body> and plain styles.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportClientError(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif", background: "#fafafa", color: "#18181b" }}>
        <div style={{ maxWidth: 360, textAlign: "center", padding: 16 }}>
          <p style={{ fontSize: 14, fontWeight: 600, margin: "0 0 4px" }}>Something went wrong</p>
          <p style={{ fontSize: 14, color: "#71717a", margin: "0 0 16px" }}>We&apos;ve been told about it. Try again, and if it keeps happening, reload the page.</p>
          <button onClick={reset} style={{ borderRadius: 8, border: 0, background: "#18181b", color: "#fff", padding: "6px 14px", fontSize: 12, cursor: "pointer" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
