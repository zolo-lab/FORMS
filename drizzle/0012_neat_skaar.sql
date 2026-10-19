CREATE TABLE "employee_organizations" (
	"employee_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employee_organizations_employee_id_organization_id_pk" PRIMARY KEY("employee_id","organization_id")
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id_number" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employees_id_number_unique" UNIQUE("id_number")
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "weekly_digest" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "package_templates" ADD COLUMN "expiry_rule" jsonb;--> statement-breakpoint
ALTER TABLE "package_templates" ADD COLUMN "completion_recipients" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "package_templates" ADD COLUMN "follow_up_statuses" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "package_templates" ADD COLUMN "reminders_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "employee_id" uuid;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "follow_up" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "login" text;--> statement-breakpoint
ALTER TABLE "employee_organizations" ADD CONSTRAINT "employee_organizations_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_organizations" ADD CONSTRAINT "employee_organizations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_organizations" ADD CONSTRAINT "employee_organizations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_login_unique" UNIQUE("login");