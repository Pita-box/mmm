"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Users } from "lucide-react";
import { MediaCollageCard } from "./MediaCollageCard";
import { UploadModal } from "./admin/upload-modal";
import { Button, Field, TextArea, TextInput } from "./admin";
import type { ModelOption } from "./admin/upload-wizard";
import {
  createUploadSessionAction,
  finalizeUploadsAction,
  uploadPosterAction,
} from "@/app/(app)/admin/admin-actions";
import type { ActionResult } from "@/app/(app)/admin/admin-actions";

export interface ModelBrowserCard {
  readonly id: string;
  readonly name: string;
  readonly mediaCount: number;
  readonly posters: readonly string[];
}

export interface ModelsBrowserProps {
  readonly cards: readonly ModelBrowserCard[];
  readonly canUpload?: boolean;
  readonly models?: readonly ModelOption[];
  readonly tagSuggestions?: Partial<Record<string, string[]>>;
  readonly onCreateModel?: (
    values: { name: string; bio: string },
  ) => Promise<ActionResult>;
}

export function ModelsBrowser({
  cards,
  canUpload = false,
  models = [],
  tagSuggestions = {},
  onCreateModel,
}: ModelsBrowserProps) {
  const router = useRouter();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<readonly File[] | null>(null);
  const [dragging, setDragging] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, startCreateTransition] = useTransition();
  const dragDepth = useRef(0);

  useEffect(() => {
    if (!createOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCreateOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [createOpen]);

  async function handleCreateModelSubmit(formData: FormData) {
    if (!onCreateModel) return;
    const name = String(formData.get("name") ?? "");
    const bio = String(formData.get("bio") ?? "");
    setCreateError(null);
    startCreateTransition(async () => {
      const result = await onCreateModel({ name, bio });
      if (!result.ok) {
        setCreateError(result.message ?? "Vytvoření modelu se nezdařilo.");
        return;
      }
      setCreateOpen(false);
      router.refresh();
    });
  }

  useEffect(() => {
    if (!canUpload) return;
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
  }, [canUpload]);

  const uploadUi = canUpload ? (
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
        models={models}
        tagSuggestions={tagSuggestions}
        initialFiles={droppedFiles}
        onCreateSession={createUploadSessionAction}
        onUploadPoster={uploadPosterAction}
        onFinalize={finalizeUploadsAction}
      />
    </>
  ) : null;

  return (
    <>
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-[length:var(--text-heading-sm)] font-black text-[color:var(--color-chalk-white)]">
          Models
        </h1>
        {canUpload ? (
          <Button
            type="button"
            onClick={() => {
              setCreateError(null);
              setCreateOpen(true);
            }}
          >
            <Plus aria-hidden size={16} />
            Přidat model
          </Button>
        ) : null}
      </header>

      {createOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Vytvořit model"
          className="fixed inset-0 z-[70] overflow-y-auto bg-black/70 backdrop-blur-sm"
          onClick={() => setCreateOpen(false)}
        >
          <div className="flex min-h-full items-center justify-center p-4 sm:p-8">
            <div
              className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-[var(--radius-2xl)] border border-graphite bg-[color:var(--color-deep-space)] p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <header className="mb-5">
                <h2 className="text-[length:var(--text-subheading)] font-bold text-chalk-white">
                  Vytvořit model
                </h2>
              </header>
              <form action={handleCreateModelSubmit} className="flex flex-col gap-4">
                <Field label="Jméno modelu" htmlFor="create-model-name">
                  <TextInput
                    id="create-model-name"
                    name="name"
                    maxLength={100}
                    required
                    placeholder="Jméno modelu"
                  />
                </Field>
                <Field label="Bio" htmlFor="create-model-bio" hint="Volitelné, max 1000 znaků.">
                  <TextArea
                    id="create-model-bio"
                    name="bio"
                    maxLength={1000}
                    placeholder="Krátký popis modelu"
                  />
                </Field>
                {createError ? (
                  <p role="alert" className="text-[length:var(--text-caption)] text-netflix-red">
                    {createError}
                  </p>
                ) : null}
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setCreateOpen(false)}
                    disabled={isCreating}
                  >
                    Zrušit
                  </Button>
                  <Button type="submit" disabled={isCreating}>
                    {isCreating ? "Vytvářím…" : "Vytvořit model"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      {cards.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {cards.map((model) => (
            <MediaCollageCard
              key={model.id}
              href={`/models/${model.id}`}
              title={model.name}
              count={model.mediaCount}
              posters={model.posters}
            />
          ))}
        </div>
      ) : (
        <p className="flex flex-col items-center gap-3 py-12 text-center text-[length:var(--text-body)] text-[color:var(--color-ash)]">
          <Users aria-hidden size={40} className="text-[color:var(--color-slate)]" />
          Zatím nejsou k dispozici žádní modelové.
        </p>
      )}
      {uploadUi}
    </>
  );
}

export default ModelsBrowser;
