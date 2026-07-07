-- MediaItem.modelId se stává NEPOVINNÝM: médium může existovat bez modelu.
-- FK se mění z ON DELETE CASCADE na ON DELETE SET NULL — smazání modelu už
-- nesmaže jeho média, jen je odpojí (zůstanou jako média bez modelu).

ALTER TABLE "MediaItem" DROP CONSTRAINT "MediaItem_modelId_fkey";

ALTER TABLE "MediaItem" ALTER COLUMN "modelId" DROP NOT NULL;

ALTER TABLE "MediaItem" ADD CONSTRAINT "MediaItem_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "ModelProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
