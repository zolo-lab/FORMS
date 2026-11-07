CREATE TABLE IF NOT EXISTS "field_dictionary" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"type" text DEFAULT 'short_text' NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "field_dictionary_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "organization_field_defs" ADD COLUMN IF NOT EXISTS "type" text DEFAULT 'short_text' NOT NULL;