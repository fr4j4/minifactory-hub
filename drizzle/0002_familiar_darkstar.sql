CREATE TABLE "cloud_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"vendor" text DEFAULT 'bambu' NOT NULL,
	"region" text DEFAULT 'global' NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"uid" text,
	"username" text,
	"token_enc" text,
	"token_expires_at" timestamp with time zone,
	"status" text DEFAULT 'activa' NOT NULL,
	"last_error" text,
	"last_sync_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "printer_links" ALTER COLUMN "host" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "printer_links" ADD COLUMN "mode" text DEFAULT 'lan' NOT NULL;--> statement-breakpoint
ALTER TABLE "printer_links" ADD COLUMN "cloud_account_id" uuid;