CREATE TABLE IF NOT EXISTS "list_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"list_type_id" uuid NOT NULL,
	"values" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'list_records_list_type_id_list_types_id_fk') THEN ALTER TABLE "list_records" ADD CONSTRAINT "list_records_list_type_id_list_types_id_fk" FOREIGN KEY ("list_type_id") REFERENCES "public"."list_types"("id") ON DELETE cascade ON UPDATE no action; END IF; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "list_records_type_idx" ON "list_records" USING btree ("list_type_id");