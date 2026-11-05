CREATE TABLE IF NOT EXISTS "deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"destination_id" text NOT NULL,
	"kind" text NOT NULL,
	"target" text NOT NULL,
	"document_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"url" text,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"round" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "attach_file_ids" jsonb;--> statement-breakpoint
ALTER TABLE "deliveries" DROP CONSTRAINT IF EXISTS "deliveries_request_id_requests_id_fk";--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;