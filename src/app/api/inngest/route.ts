import { serve } from "inngest/next"; 
import { inngest } from "@/lib/inngest";
import { executeSkillRun } from "@/inngest/skill";

// Explicit duration floor for this route, paired with checkpointing's
// maxRuntime in src/lib/inngest.ts (45s). Vercel's default is
// plan/fluid-compute-dependent (300s with fluid compute on, which is the
// default on most projects — but only 15s/10s if fluid compute is off).
// Setting this explicitly removes that ambiguity entirely rather than
// relying on a setting that lives in the dashboard and isn't visible from
// the code. Raise alongside maxRuntime if a single tenant's roster/audit
// routinely needs more headroom.
export const maxDuration = 60;

// Expose Next.js App Router HTTP handlers for communication
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    executeSkillRun, // ✅ Registers your worker function into the serverless endpoint mesh
  ],
});