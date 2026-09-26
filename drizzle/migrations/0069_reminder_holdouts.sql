CREATE TABLE "reminder_holdouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" text NOT NULL,
	"booking_id" text NOT NULL,
	"held_out" boolean NOT NULL,
	"percent" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reminder_holdouts" ADD CONSTRAINT "reminder_holdouts_engagement_id_engagements_engagement_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("engagement_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reminder_holdouts_booking_uidx" ON "reminder_holdouts" USING btree ("engagement_id","booking_id");