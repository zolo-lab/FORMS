CREATE TABLE "organization_field_defs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_field_defs_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "field_values" jsonb DEFAULT '{}'::jsonb NOT NULL;