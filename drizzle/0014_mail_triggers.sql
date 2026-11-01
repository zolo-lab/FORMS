CREATE TABLE "mail_triggers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"key" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"recipients" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fixed_recipients" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mail_triggers_org_key_uq" UNIQUE NULLS NOT DISTINCT("organization_id","key")
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "secretariat_emails" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "bookkeeping_emails" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "mail_triggers" ADD CONSTRAINT "mail_triggers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;