CREATE TABLE "list_type_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"list_type_id" uuid NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"kind" text DEFAULT 'short_text' NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"multi" boolean DEFAULT false NOT NULL,
	"parent_type_id" uuid,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "list_records" ADD COLUMN "order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "list_types" ADD COLUMN "order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "list_type_fields" ADD CONSTRAINT "list_type_fields_list_type_id_list_types_id_fk" FOREIGN KEY ("list_type_id") REFERENCES "public"."list_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_type_fields" ADD CONSTRAINT "list_type_fields_parent_type_id_list_types_id_fk" FOREIGN KEY ("parent_type_id") REFERENCES "public"."list_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "list_type_fields_key_idx" ON "list_type_fields" USING btree ("list_type_id","key");--> statement-breakpoint
-- Keep what was built on the old dictionary: every field a list type pointed at becomes a field of that type, with
-- the dictionary's Hebrew name and type (multi-part types become plain text), the old display field first.
INSERT INTO "list_type_fields" ("list_type_id", "key", "label", "kind", "order")
SELECT t."id", f.key, coalesce(d."label", f.key),
       CASE WHEN d."type" IN ('short_text','long_text','number','currency','percent','id_number','phone','email','date') THEN d."type" ELSE 'short_text' END,
       CASE WHEN f.key = t."display_key" THEN -1 ELSE f.ord::int END
FROM "list_types" t
CROSS JOIN LATERAL jsonb_array_elements_text(t."fields") WITH ORDINALITY AS f(key, ord)
LEFT JOIN "field_dictionary" d ON d."key" = f.key
ON CONFLICT DO NOTHING;--> statement-breakpoint
DROP TABLE "field_dictionary" CASCADE;--> statement-breakpoint
ALTER TABLE "list_types" DROP COLUMN "fields";--> statement-breakpoint
ALTER TABLE "list_types" DROP COLUMN "display_key";
