/**
 * Admin — nahrání média (task 21.2). Vykresluje `MediaUploadForm` s reálným
 * seznamem modelů a odeslání napojuje na `uploadMediaAction` (Drive upload +
 * perzistence + rollback, R5.1/R5.4/R5.6).
 */
import {
  MediaUploadForm,
  AdminMediaList,
  DriveImportButton,
  type AdminMediaRow,
  type ModelOption,
} from "@/components/admin";
import { prisma } from "@/lib/prisma";
import { modelService } from "@/services/model-service";
import { tagService } from "@/services/tag-service";
import { requireUploader } from "@/lib/session";
import { canDeleteMedia } from "@/lib/permissions";
import {
  deleteMediaAction,
  importFromDriveAction,
  createUploadSessionAction,
  finalizeDriveUploadAction,
  setMediaPublishedAction,
  assignMediaModelAction,
  addMediaTagAction,
  removeMediaTagAction,
} from "../admin-actions";

export default async function AdminMediaPage() {
  const principal = await requireUploader();
  const profiles = await modelService.listProfiles();
  const models: ModelOption[] = profiles.map((p) => ({ id: p.id, name: p.name }));

  // Našeptávač: existující hodnoty štítků seskupené po kategoriích (plán 012).
  const tagValues = await tagService.listValues();
  const tagSuggestions: Record<string, string[]> = {};
  for (const { category, value } of tagValues) {
    (tagSuggestions[category] ??= []).push(value);
  }

  const media = await prisma.mediaItem.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      model: { select: { name: true } },
      tags: { include: { tagValue: { select: { id: true, category: true, value: true } } } },
    },
  });
  const rows: AdminMediaRow[] = media.map((m) => ({
    id: m.id,
    label: `${m.model?.name ?? "Bez modelu"} · ${m.mediaType}`,
    status: m.status,
    canDelete: canDeleteMedia(principal.role, principal.userId, m),
    modelId: m.modelId,
    tags: m.tags.map((mt) => ({
      id: mt.tagValue.id,
      category: mt.tagValue.category,
      value: mt.tagValue.value,
    })),
  }));

  return (
    <div className="flex flex-col gap-8">
      <DriveImportButton onImport={importFromDriveAction} />
      <MediaUploadForm
        models={models}
        tagSuggestions={tagSuggestions}
        onCreateSession={createUploadSessionAction}
        onFinalize={finalizeDriveUploadAction}
      />
      <AdminMediaList
        rows={rows}
        models={models}
        tagSuggestions={tagSuggestions}
        onDelete={deleteMediaAction}
        onSetPublished={setMediaPublishedAction}
        onAssignModel={assignMediaModelAction}
        onAddTag={addMediaTagAction}
        onRemoveTag={removeMediaTagAction}
      />
    </div>
  );
}
