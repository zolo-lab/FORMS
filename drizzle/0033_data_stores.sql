CREATE TABLE IF NOT EXISTS "data_store_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"values" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "data_stores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"columns" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_column_number" integer DEFAULT 0 NOT NULL,
	"display_column" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'data_store_rows_store_id_data_stores_id_fk') THEN ALTER TABLE "data_store_rows" ADD CONSTRAINT "data_store_rows_store_id_data_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."data_stores"("id") ON DELETE cascade ON UPDATE no action; END IF; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "data_store_rows_store_idx" ON "data_store_rows" USING btree ("store_id","order");