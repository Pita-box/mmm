"use client";

import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { UploadModal } from "./admin/upload-modal";
import type { ModelOption } from "./admin/upload-wizard";
import {
  createUploadSessionAction,
  finalizeUploadsAction,
  uploadPosterAction,
} from "@/app/(app)/admin/admin-actions";

export interface ModelDetailUploadProps {
  readonly model: ModelOption;
  readonly tagSuggestions?: Partial<Record<string, string[]>>;
}

export function ModelDetailUpload({
  model,
  tagSuggestions = {},
}: ModelDetailUploadProps) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<readonly File[] | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  useEffect(() => {
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types?.includes("Files");

    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current += 1;
      setDragging(true);
    };
    const onOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!e.dataTransfer?.files?.length) return;
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      setDroppedFiles(Array.from(e.dataTransfer.files));
      setUploadOpen(true);
    };

    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setDroppedFiles(null);
          setUploadOpen(true);
        }}
        aria-label="Nahrát média"
        title="Nahrát média"
        style={{
          borderColor: "color-mix(in oklab, var(--color-chalk-white) 15%, transparent)",
          boxShadow: "0 8px 30px rgba(0, 0, 0, 0.5)",
        }}
        className="fixed bottom-24 right-6 z-[60] flex h-14 w-14 items-center justify-center rounded-full border bg-[color:var(--color-deep-space)]/60 text-[color:var(--color-chalk-white)] backdrop-blur-md transition-all hover:scale-110 hover:bg-[color:var(--color-deep-space)]/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-chalk-white)]"
      >
        <Plus aria-hidden size={26} />
      </button>

      {dragging ? (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-[65] flex items-center justify-center bg-[color:var(--color-deep-space)]/70 p-4 backdrop-blur-sm sm:p-8"
        >
          <div className="flex h-[90vh] max-h-[90vh] w-full max-w-3xl flex-col items-center justify-center gap-3 rounded-[var(--radius-2xl)] border-2 border-dashed border-[color:var(--color-netflix-red)] bg-[color:var(--color-deep-space)]/60 text-center">
            <Plus aria-hidden size={40} className="text-[color:var(--color-netflix-red)]" />
            <span className="text-[length:var(--text-subheading)] font-bold text-chalk-white">
              Pusťte soubory pro nahrání
            </span>
          </div>
        </div>
      ) : null}

      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        models={[model]}
        tagSuggestions={tagSuggestions}
        initialFiles={droppedFiles}
        initialModelId={model.id}
        lockModelSelection
        onCreateSession={createUploadSessionAction}
        onUploadPoster={uploadPosterAction}
        onFinalize={finalizeUploadsAction}
      />
    </>
  );
}

export default ModelDetailUpload;
