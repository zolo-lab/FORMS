ALTER TABLE "requests" ADD COLUMN "identifier_label" text;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "identifier_value" text;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "message_details" jsonb DEFAULT '[]'::jsonb NOT NULL;