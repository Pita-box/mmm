ALTER TABLE "ModelProfile" ADD COLUMN "driveFolderId" TEXT;

ALTER TABLE "ModelProfile" ADD CONSTRAINT "ModelProfile_driveFolderId_key" UNIQUE ("driveFolderId");
