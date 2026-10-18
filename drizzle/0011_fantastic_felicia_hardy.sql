CREATE TABLE "detect_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_label" text NOT NULL,
	"source_norm" text NOT NULL,
	"detected_type" text NOT NULL,
	"kept" boolean NOT NULL,
	"final_label" text,
	"final_type" text,
	"final_key" text,
	"template_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "detect_feedback_norm_idx" ON "detect_feedback" USING btree ("source_norm","created_at");