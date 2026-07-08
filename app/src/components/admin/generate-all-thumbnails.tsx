"use client";

/**
 * GenerateAllThumbnails — hromadné vygenerování video náhledů (snímek z 1/3
 * délky) pro všechna publikovaná videa. Zachycení běží v prohlížeči
 * (`captureVideoPoster` z proxy streamu), proto klientská komponenta; ukládání
 * posteru jde přes server akce. Zpracovává sekvenčně s průběhem.
 */
import { useState } from "react";
import { ImagePlus } from "lucide-react";
import { AdminCard, Button } from "./admin-ui";
import { captureVideoPoster, blobToBase64 } from "@/lib/video-poster";

export interface GenerateVideo {
  readonly id: string;
  readonly streamUrl: string;
}

export interface GenerateAllThumbnailsProps {
  readonly videos: readonly GenerateVideo[];
  readonly onUploadPoster: (
    base64: string,
    name: string,
  ) => Promise<{ ok: boolean; driveFileId?: string; message?: string }>;
  readonly onSetPoster: (
    id: string,
    posterDriveFileId: string,
  ) => Promise<{ ok: boolean; message?: string }>;
}

export function GenerateAllThumbnails({ videos, onUploadPoster, onSetPoster }: GenerateAllThumbnailsProps) {
  const [running, setRunning] = useState(false);
  const [processed, setProcessed] = useState(0);
  const [status, setStatus] = useState<string | null>(null);

  async function run() {
    if (running || videos.length === 0) return;
    setRunning(true);
    setProcessed(0);
    setStatus(null);
    let ok = 0;
    let bad = 0;
    for (let i = 0; i < videos.length; i++) {
      const v = videos[i];
      try {
        const blob = await captureVideoPoster(v.streamUrl);
        const base64 = await blobToBase64(blob);
        const up = await onUploadPoster(base64, `${v.id}.poster.jpg`);
        if (!up.ok || !up.driveFileId) throw new Error(up.message ?? "upload");
        const set = await onSetPoster(v.id, up.driveFileId);
        if (!set.ok) throw new Error(set.message ?? "set");
        ok++;
      } catch {
        bad++;
      }
      setProcessed(i + 1);
    }
    setRunning(false);
    setStatus(`Done: ${ok} generated, ${bad} failed.`);
  }

  return (
    <AdminCard
      title="Video thumbnails"
      description="Generates a thumbnail (frame from 1/3 of the length) for all published videos."
    >
      <div className="flex flex-col gap-3">
        <div>
          <Button type="button" onClick={() => void run()} disabled={running || videos.length === 0}>
            <ImagePlus aria-hidden size={16} />
            {running
              ? `Generating… ${processed}/${videos.length}`
              : `Generate thumbnails for all videos (${videos.length})`}
          </Button>
        </div>
        {videos.length === 0 ? (
          <p className="text-[length:var(--text-caption)] text-ash">No published videos.</p>
        ) : null}
        {status ? (
          <p role="status" className="text-[length:var(--text-caption)] text-silver">
            {status}
          </p>
        ) : null}
      </div>
    </AdminCard>
  );
}

export default GenerateAllThumbnails;
