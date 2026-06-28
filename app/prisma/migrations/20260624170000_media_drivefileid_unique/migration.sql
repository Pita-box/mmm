-- driveFileId unikátní: zamezí duplicitám při opakovaném importu z Drive (plán 007).
ALTER TABLE "MediaItem" ADD CONSTRAINT "MediaItem_driveFileId_key" UNIQUE ("driveFileId");
