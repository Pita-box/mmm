/**
 * Admin — média (task 21.2). Synchronizace z Drive + hromadné generování
 * video náhledů (snímek z 1/3 délky). Nahrávání a správa jednotlivých médií
 * probíhá jinde (popup „+" / `/upload`, editace v lightboxu).
 */
import {
  DriveImportButton,
  GenerateAllThumbnails,
  type GenerateVideo,
} from "@/components/admin";
import { prisma } from "@/lib/prisma";
import { requireUploader } from "@/lib/session";
import { streamingUrlFor } from "@/lib/media-presentation";
import {
  importFromDriveAction,
  uploadPosterAction,
  setMediaPosterAction,
} from "../admin-actions";

export default async function AdminMediaPage() {
  const principal = await requireUploader();
  const now = new Date();

  // Publikovaná videa (proxy stream vyžaduje Approved_Media) pro hromadné náhledy.
  const videos = await prisma.mediaItem.findMany({
    where: { mediaType: "video", status: "published", publishAt: { lte: now } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  const videoList: GenerateVideo[] = videos
    .map((v) => ({ id: v.id, streamUrl: streamingUrlFor(v.id, principal.userId, now) }))
    .filter((v): v is GenerateVideo => Boolean(v.streamUrl));

  return (
    <div className="flex flex-col gap-8">
      <DriveImportButton onImport={importFromDriveAction} />
      <GenerateAllThumbnails
        videos={videoList}
        onUploadPoster={uploadPosterAction}
        onSetPoster={setMediaPosterAction}
      />
    </div>
  );
}
