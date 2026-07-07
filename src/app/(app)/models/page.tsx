import { ModelsBrowser } from "@/components/ModelsBrowser";
import type { ModelOption } from "@/components/admin";
import { modelService } from "@/services/model-service";
import { requireSession } from "@/lib/session";
import { requireVisibleSection } from "@/lib/section-visibility";
import { membershipGate } from "@/lib/membership-gate";
import { thumbUrlFor } from "@/lib/media-presentation";
import { tagService } from "@/services/tag-service";
import { createModelProfileAction } from "../admin/admin-actions";

export default async function ModelsPage() {
  const principal = await requireSession();
  await requireVisibleSection("models", principal.role);
  const gate = await membershipGate(principal);
  if (gate) return gate;
  const canUpload = principal.role === "Admin" || principal.role === "Distributor";
  const profiles = await modelService.listProfilesWithPreview();

  let models: ModelOption[] = [];
  const tagSuggestions: Record<string, string[]> = {};
  if (canUpload) {
    const allProfiles = await modelService.listProfiles();
    models = allProfiles.map((profile) => ({ id: profile.id, name: profile.name }));
    const tagValues = await tagService.listValues();
    for (const { category, value } of tagValues) {
      (tagSuggestions[category] ??= []).push(value);
    }
  }

  async function createModelAction(values: {
    name: string;
    bio: string;
  }) {
    "use server";
    return createModelProfileAction(values);
  }

  return (
    <section className="flex flex-col gap-8">
      <ModelsBrowser
        cards={profiles.map((model) => ({
          id: model.id,
          name: model.name,
          mediaCount: model.mediaCount,
          posters: model.recentMediaIds
            .map((id) => thumbUrlFor(id, principal.userId))
            .filter((url): url is string => Boolean(url)),
        }))}
        canUpload={canUpload}
        models={models}
        tagSuggestions={tagSuggestions}
        onCreateModel={createModelAction}
      />
    </section>
  );
}
