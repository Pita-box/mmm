/**
 * Admin — správa profilů modelů (task 21.2, R4.1). Vykresluje `ModelProfileForm`
 * v režimu vytvoření a odeslání napojuje na `createModelProfileAction`.
 */
import {
  ModelProfileForm,
  type ModelProfileValues,
} from "@/components/admin";
import { requireUploader } from "@/lib/session";
import { createModelProfileAction } from "../admin-actions";

export default async function AdminModelsPage() {
  await requireUploader();

  async function onSubmit(values: ModelProfileValues): Promise<void> {
    "use server";
    await createModelProfileAction({ name: values.name, bio: values.bio });
  }

  return <ModelProfileForm mode="create" onSubmit={onSubmit} />;
}
