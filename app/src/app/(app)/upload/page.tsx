/**
 * /upload — bulk nahrání + štítkovací wizard (plán 012). Jen pro uploadery
 * (Admin/Distributor); `requireUploader` přesměruje ostatní.
 */
import { UploadWizard, type ModelOption } from "@/components/admin";
import { modelService } from "@/services/model-service";
import { tagService } from "@/services/tag-service";
import { requireUploader } from "@/lib/session";
import {
  createUploadSessionAction,
  finalizeUploadsAction,
  uploadPosterAction,
} from "../admin/admin-actions";

export default async function UploadPage() {
  await requireUploader();
  const profiles = await modelService.listProfiles();
  const models: ModelOption[] = profiles.map((p) => ({ id: p.id, name: p.name }));

  const tagValues = await tagService.listValues();
  const tagSuggestions: Record<string, string[]> = {};
  for (const { category, value } of tagValues) {
    (tagSuggestions[category] ??= []).push(value);
  }

  return (
    <UploadWizard
      models={models}
      tagSuggestions={tagSuggestions}
      onCreateSession={createUploadSessionAction}
      onUploadPoster={uploadPosterAction}
      onFinalize={finalizeUploadsAction}
    />
  );
}
