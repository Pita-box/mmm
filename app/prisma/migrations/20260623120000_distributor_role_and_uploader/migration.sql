-- Distributor role + ownership of uploaded media.
-- Enum value is added separately (run before this) because ALTER TYPE ... ADD
-- VALUE may not be combined with use of the value in one transaction.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'Distributor';

-- Who uploaded the media (nullable: legacy/admin uploads stay null → only admins
-- can delete them). Distributors may delete only media they uploaded.
ALTER TABLE "MediaItem" ADD COLUMN IF NOT EXISTS "uploaderId" TEXT;

DO $$ BEGIN
  ALTER TABLE "MediaItem"
    ADD CONSTRAINT "MediaItem_uploaderId_fkey"
    FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "MediaItem_uploaderId_idx" ON "MediaItem"("uploaderId");
