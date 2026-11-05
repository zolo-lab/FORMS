-- Parts are cut on the way out and never stored as rows, so these columns are gone.
-- Any row that was written as a part in the short window where the old code was live is removed first:
-- without `parent_document_id` it would look like a document of the request and be re-stamped as one.
DELETE FROM "package_documents" WHERE "parent_document_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "package_documents" DROP COLUMN IF EXISTS "parent_document_id";--> statement-breakpoint
ALTER TABLE "package_documents" DROP COLUMN IF EXISTS "pages";--> statement-breakpoint
ALTER TABLE "package_documents" DROP COLUMN IF EXISTS "part_name";--> statement-breakpoint
ALTER TABLE "package_documents" DROP COLUMN IF EXISTS "type_id";
