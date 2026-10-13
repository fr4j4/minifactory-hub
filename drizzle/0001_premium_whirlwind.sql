CREATE TABLE "printer_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"machine_id" uuid NOT NULL,
	"vendor" text DEFAULT 'bambu' NOT NULL,
	"serial" text NOT NULL,
	"host" text NOT NULL,
	"access_code_enc" text NOT NULL,
	"model" text,
	"name" text,
	"mqtt_port" integer DEFAULT 8883 NOT NULL,
	"camera_port" integer,
	"ftp_port" integer DEFAULT 990 NOT NULL,
	"url_prefix" text DEFAULT 'file:///sdcard/' NOT NULL,
	"fingerprint" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"sync_queue" boolean DEFAULT true NOT NULL,
	"last_seen_at" timestamp with time zone,
	"last_status" jsonb,
	"last_error" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX "printer_links_serial_uq" ON "printer_links" USING btree ("workspace_id","serial");