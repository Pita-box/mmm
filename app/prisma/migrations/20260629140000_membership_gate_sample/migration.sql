-- Výběr médií zobrazených jako sample náhledy v MembershipGate.
CREATE TABLE "MembershipGateSample" (
  "mediaId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MembershipGateSample_pkey" PRIMARY KEY ("mediaId")
);

ALTER TABLE "MembershipGateSample"
  ADD CONSTRAINT "MembershipGateSample_mediaId_fkey"
  FOREIGN KEY ("mediaId") REFERENCES "MediaItem"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
