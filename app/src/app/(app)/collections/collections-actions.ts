"use server";

/**
 * Server actions privátních kolekcí (task 21.2, R14).
 *
 * Všechny operace běží pod identitou přihlášeného uživatele; Collection_Service
 * vynucuje vlastnictví (cizí kolekce → 403/forbidden, R14.4/R14.5) a guardy
 * členství (přidat lze jen Approved_Media, odebrat jen přítomné — R14.7/R14.8).
 * Akce přijímají `FormData`, takže fungují i jako přímé `form action` bez JS.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSessionPrincipal } from "@/lib/session";
import { collectionService } from "@/services/collection-service";

async function requireUserId(): Promise<string> {
  const principal = await getSessionPrincipal();
  if (principal === null) redirect("/signin");
  return principal.userId;
}

/** Vytvoření kolekce s validací názvu (R14.1, R14.6). */
export async function createCollectionAction(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const name = String(formData.get("name") ?? "");
  await collectionService.createCollection(userId, name);
  revalidatePath("/collections");
}

/** Smazání vlastní kolekce (R14.4). */
export async function deleteCollectionAction(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const id = String(formData.get("id") ?? "");
  await collectionService.deleteCollection(id, userId);
  revalidatePath("/collections");
}

/** Přidání Approved_Media do vlastní kolekce (R14.2, R14.7). */
export async function addMediaAction(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const collectionId = String(formData.get("collectionId") ?? "");
  const mediaId = String(formData.get("mediaId") ?? "");
  await collectionService.addMedia(collectionId, userId, mediaId);
  revalidatePath(`/collections/${collectionId}`);
}

/** Odebrání přítomného média z vlastní kolekce (R14.3, R14.8). */
export async function removeMediaAction(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const collectionId = String(formData.get("collectionId") ?? "");
  const mediaId = String(formData.get("mediaId") ?? "");
  await collectionService.removeMedia(collectionId, userId, mediaId);
  revalidatePath(`/collections/${collectionId}`);
}
