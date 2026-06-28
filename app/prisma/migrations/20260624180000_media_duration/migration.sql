-- Délka videa v ms (z Drive videoMediaMetadata.durationMillis); nullable (plán 007 follow-up).
ALTER TABLE "MediaItem" ADD COLUMN "durationMs" INTEGER;
