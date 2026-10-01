ALTER TABLE "skill_runs" ADD COLUMN "execution_started_at" timestamp;--> statement-breakpoint
-- Runs already in flight when this ships started before the queue was
-- tracked; time them from creation, as the reaper always did.
UPDATE "skill_runs" SET "execution_started_at" = "started_at" WHERE "status" = 'running' AND "execution_started_at" IS NULL;