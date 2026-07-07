-- Model profile cover photo source + view position.
ALTER TABLE "ModelProfile"
  ADD COLUMN "coverMediaId" TEXT,
  ADD COLUMN "coverFocusY" DOUBLE PRECISION;
