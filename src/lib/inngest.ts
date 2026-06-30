import { Inngest, EventSchemas } from "inngest";

// ── Strict Event Payload Schemas ───────────────────────────────────────────
type ShowtimeEvents = {
  "skill/run.execute": {
    data: {
      runId: string;
      engagementId: string;
      skillName: "pin-down" | "pile-on" | "pre-call-read" | "win-back" | "leak-map";
      tenant: any; // Context payload containing the full PostgreSQL engagement row
      auditType?: "weekly" | "monthly";
    };
  };
};

/**
 * Global Inngest Client
 * Used by API routes to publish events, and by workers to handle jobs.
 */
export const inngest = new Inngest({
  id: "showtime-revenue-infrastructure", // App name identifier inside the dashboard
  schemas: new EventSchemas().fromRecord<ShowtimeEvents>(),
});