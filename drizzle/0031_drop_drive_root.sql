-- "עיבוד טופס" no longer files into Drive, and this column had no other reader (no UI ever set it).
ALTER TABLE "organizations" DROP COLUMN IF EXISTS "drive_root_folder_id";
