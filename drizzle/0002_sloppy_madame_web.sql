CREATE TYPE "public"."channel" AS ENUM('email', 'sms', 'whatsapp', 'link');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('queued', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('draft', 'in_progress', 'returned', 'completed', 'declined', 'cancelled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."step_action" AS ENUM('fill', 'sign', 'approve', 'fill_and_sign', 'view');--> statement-breakpoint
CREATE TYPE "public"."step_status" AS ENUM('pending', 'active', 'in_progress', 'completed', 'declined', 'returned', 'skipped', 'expired', 'cancelled', 'delegated');--> statement-breakpoint
CREATE TYPE "public"."template_kind" AS ENUM('web', 'pdf', 'both');--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "bulk_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"package_template_id" uuid NOT NULL,
	"file_id" uuid,
	"row_count" integer DEFAULT 0 NOT NULL,
	"created_count" integer DEFAULT 0 NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"step_id" uuid,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"key" text NOT NULL,
	"channel" "channel" NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"request_id" uuid,
	"step_id" uuid,
	"channel" "channel" NOT NULL,
	"to" text NOT NULL,
	"template_key" text NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"status" "notification_status" DEFAULT 'queued' NOT NULL,
	"provider_id" text,
	"error" text,
	"scheduled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "package_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"template_version_id" uuid NOT NULL,
	"order" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"final_file_id" uuid,
	"final_sha256" text,
	"generated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "package_template_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"package_template_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"order" integer NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "package_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"workflow" jsonb NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminder_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"step_id" uuid NOT NULL,
	"next_run_at" timestamp with time zone NOT NULL,
	"interval_hours" integer NOT NULL,
	"max_count" integer NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"stopped_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"package_template_id" uuid NOT NULL,
	"kind" text DEFAULT 'onboarding' NOT NULL,
	"subject_name" text NOT NULL,
	"subject_id_number" text,
	"subject_email" text,
	"subject_phone" text,
	"created_by" uuid,
	"status" "request_status" DEFAULT 'draft' NOT NULL,
	"current_order" integer DEFAULT 0 NOT NULL,
	"due_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"external_ref" text,
	"api_params" jsonb,
	"redirect_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signatures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"step_id" uuid NOT NULL,
	"field_id" text NOT NULL,
	"kind" text NOT NULL,
	"file_id" uuid,
	"typed_text" text,
	"signed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signing_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"order" integer NOT NULL,
	"parallel_group" integer DEFAULT 0 NOT NULL,
	"role" text NOT NULL,
	"action" "step_action" DEFAULT 'fill' NOT NULL,
	"assignee_user_id" uuid,
	"assignee_name" text,
	"assignee_email" text,
	"assignee_phone" text,
	"assignee_from_field_id" text,
	"skip_if" jsonb,
	"status" "step_status" DEFAULT 'pending' NOT NULL,
	"channel" "channel" DEFAULT 'email' NOT NULL,
	"otp_required" boolean DEFAULT false NOT NULL,
	"otp_hash" text,
	"otp_expires_at" timestamp with time zone,
	"otp_attempts" integer DEFAULT 0 NOT NULL,
	"delegated_from_step_id" uuid,
	"returned_to_step_id" uuid,
	"decline_reason" text,
	"return_reason" text,
	"activated_at" timestamp with time zone,
	"first_viewed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"due_at" timestamp with time zone,
	"signer_ip" text,
	"signer_user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "step_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"step_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "step_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"step_id" uuid NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"template_id" uuid,
	"url" text NOT NULL,
	"secret" text NOT NULL,
	"events" text[] DEFAULT '{}'::text[] NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "form_templates" ADD COLUMN "kind" "template_kind" DEFAULT 'web' NOT NULL;--> statement-breakpoint
ALTER TABLE "form_templates" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "logo_file_id" uuid;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "primary_color" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "sender_name" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "sender_email" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "sms_sender_id" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "date_format" text DEFAULT 'dd/MM/yyyy' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "stamp_image_file_id" uuid;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "reminder_policy" jsonb;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulk_jobs" ADD CONSTRAINT "bulk_jobs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulk_jobs" ADD CONSTRAINT "bulk_jobs_package_template_id_package_templates_id_fk" FOREIGN KEY ("package_template_id") REFERENCES "public"."package_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulk_jobs" ADD CONSTRAINT "bulk_jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_documents" ADD CONSTRAINT "package_documents_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_documents" ADD CONSTRAINT "package_documents_template_version_id_form_template_versions_id_fk" FOREIGN KEY ("template_version_id") REFERENCES "public"."form_template_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_template_items" ADD CONSTRAINT "package_template_items_package_template_id_package_templates_id_fk" FOREIGN KEY ("package_template_id") REFERENCES "public"."package_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_template_items" ADD CONSTRAINT "package_template_items_template_id_form_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."form_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_templates" ADD CONSTRAINT "package_templates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_schedules" ADD CONSTRAINT "reminder_schedules_step_id_signing_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."signing_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_package_template_id_package_templates_id_fk" FOREIGN KEY ("package_template_id") REFERENCES "public"."package_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_step_id_signing_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."signing_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signing_steps" ADD CONSTRAINT "signing_steps_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signing_steps" ADD CONSTRAINT "signing_steps_assignee_user_id_users_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "step_tokens" ADD CONSTRAINT "step_tokens_step_id_signing_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."signing_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_step_id_signing_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."signing_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_template_id_form_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."form_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_request_created_idx" ON "events" USING btree ("request_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "message_templates_org_key_channel_uq" ON "message_templates" USING btree ("organization_id","key","channel");--> statement-breakpoint
CREATE UNIQUE INDEX "package_template_items_pkg_template_uq" ON "package_template_items" USING btree ("package_template_id","template_id");--> statement-breakpoint
CREATE INDEX "reminder_schedules_next_idx" ON "reminder_schedules" USING btree ("next_run_at") WHERE "reminder_schedules"."stopped_at" is null;--> statement-breakpoint
CREATE INDEX "requests_org_status_idx" ON "requests" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "requests_due_idx" ON "requests" USING btree ("due_at");--> statement-breakpoint
CREATE INDEX "signing_steps_request_idx" ON "signing_steps" USING btree ("request_id","order");--> statement-breakpoint
CREATE UNIQUE INDEX "submissions_step_uq" ON "submissions" USING btree ("step_id");--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_slug_unique" UNIQUE("slug");