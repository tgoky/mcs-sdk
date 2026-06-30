import { serve } from "inngest/next"; 
import { inngest } from "@/lib/inngest";
import { executeSkillRun } from "@/inngest/skill";

// Expose Next.js App Router HTTP handlers for communication
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    executeSkillRun, // ✅ Registers your worker function into the serverless endpoint mesh
  ],
});