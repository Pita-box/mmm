"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Users } from "lucide-react";
import { MediaCollageCard } from "./MediaCollageCard";
import { MediaUploadLauncher } from "./MediaUploadLauncher";
import { Button, Field, TextArea, TextInput } from "./admin";
import type { ModelOption } from "./admin/upload-wizard";
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
  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, startCreateTransition] = useTransition();

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
        setCreateError(result.message ?? "Failed to create model.");
        return;
      }
      setCreateOpen(false);
      router.refresh();
    });
  }

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
            Add model
          </Button>
        ) : null}
      </header>

      {createOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Create model"
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
                  Create model
                </h2>
              </header>
              <form action={handleCreateModelSubmit} className="flex flex-col gap-4">
                <Field label="Model name" htmlFor="create-model-name">
                  <TextInput
                    id="create-model-name"
                    name="name"
                    maxLength={100}
                    required
                    placeholder="Model name"
                  />
                </Field>
                <Field label="Bio" htmlFor="create-model-bio" hint="Optional, max 1000 characters.">
                  <TextArea
                    id="create-model-bio"
                    name="bio"
                    maxLength={1000}
                    placeholder="Short description of the model"
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
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isCreating}>
                    {isCreating ? "Creating…" : "Create model"}
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
          No models available yet.
        </p>
      )}
      {canUpload ? <MediaUploadLauncher models={models} tagSuggestions={tagSuggestions} /> : null}
    </>
  );
}

export default ModelsBrowser;
