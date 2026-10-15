ALTER TABLE "suppliers" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "verified_by" uuid;