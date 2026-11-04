ALTER TABLE "package_documents" ADD COLUMN IF NOT EXISTS "parent_document_id" uuid;--> statement-breakpoint
ALTER TABLE "package_documents" ADD COLUMN IF NOT EXISTS "pages" text;--> statement-breakpoint
ALTER TABLE "package_documents" ADD COLUMN IF NOT EXISTS "part_name" text;--> statement-breakpoint
ALTER TABLE "package_documents" ADD COLUMN IF NOT EXISTS "type_id" uuid;