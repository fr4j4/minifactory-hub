CREATE TABLE "ai_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid,
	"feature" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"tier" text DEFAULT 'fast' NOT NULL,
	"in_tokens" integer DEFAULT 0 NOT NULL,
	"out_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" double precision DEFAULT 0 NOT NULL,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"ok" boolean DEFAULT true NOT NULL,
	"error" text,
	"cache_hit" boolean DEFAULT false NOT NULL,
	"prompt_log" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"feature" text NOT NULL,
	"subject_type" text,
	"subject_id" uuid,
	"input_hash" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"proposal" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"rationale" jsonb DEFAULT '{}'::jsonb,
	"status" text DEFAULT 'proposed' NOT NULL,
	"applied_at" timestamp with time zone,
	"applied_by" uuid,
	"outcome" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE INDEX "ai_calls_created_ix" ON "ai_calls" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ai_suggestions_subject_ix" ON "ai_suggestions" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "ai_suggestions_hash_ix" ON "ai_suggestions" USING btree ("input_hash");