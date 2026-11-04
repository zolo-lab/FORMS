ALTER TABLE "requests" ADD COLUMN IF NOT EXISTS "identifier_label" text;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN IF NOT EXISTS "identifier_value" text;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN IF NOT EXISTS "message_details" jsonb DEFAULT '[]'::jsonb NOT NULL;
