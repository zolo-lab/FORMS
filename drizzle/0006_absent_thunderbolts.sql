CREATE TABLE "package_permissions" (
	"package_template_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"can_open" boolean DEFAULT true NOT NULL,
	"can_view_all" boolean DEFAULT false NOT NULL,
	"can_edit_chain" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "package_permissions_package_template_id_user_id_pk" PRIMARY KEY("package_template_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "package_permissions" ADD CONSTRAINT "package_permissions_package_template_id_package_templates_id_fk" FOREIGN KEY ("package_template_id") REFERENCES "public"."package_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_permissions" ADD CONSTRAINT "package_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;