ALTER TABLE "package_permissions" ADD COLUMN IF NOT EXISTS "can_edit" boolean DEFAULT false NOT NULL;
