-- Profile avatar source + crop settings.
ALTER TABLE "ModelProfile"
  ADD COLUMN "avatarCropX" DOUBLE PRECISION,
  ADD COLUMN "avatarCropY" DOUBLE PRECISION,
  ADD COLUMN "avatarZoom" DOUBLE PRECISION;
