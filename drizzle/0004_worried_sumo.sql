CREATE TABLE "export_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"package_template_id" uuid,
	"template" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "export_templates" ADD CONSTRAINT "export_templates_package_template_id_package_templates_id_fk" FOREIGN KEY ("package_template_id") REFERENCES "public"."package_templates"("id") ON DELETE set null ON UPDATE no action;