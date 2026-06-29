"use client";

/**
 * CollectionGallery — obsah privátní kolekce s přehrávačem (R14.3 + R6.6).
 *
 * Vykreslí mřížku médií kolekce; výběr karty otevře přehrávač (`MediaLightbox`,
 * proxy Streaming_URL). U každé karty je formulář „Odebrat" napojený na server
 * action `onRemove` (předaná ze server komponenty — R14.3/R14.8).
 */
import { useState } from "react";
import { X } from "lucide-react";
import { MediaCard, type MediaCardItem } from "./MediaCard";
import { MediaLightbox } from "./MediaLightbox";
import { Button } from "./admin/admin-ui";

export interface CollectionGalleryProps {
  readonly collectionId: string;
  readonly media: readonly MediaCardItem[];
  /** Server action odebrání média z kolekce (přijímá `FormData`). */
  readonly onRemove: (formData: FormData) => void | Promise<void>;
}

export function CollectionGallery({
  collectionId,
  media,
  onRemove,
}: CollectionGalleryProps) {
  const [selected, setSelected] = useState<MediaCardItem | null>(null);

  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {media.map((item) => (
          <div key={item.id} className="flex flex-col gap-2">
            <MediaCard item={item} onSelect={setSelected} />
            <form action={onRemove}>
              <input type="hidden" name="collectionId" value={collectionId} />
              <input type="hidden" name="mediaId" value={item.id} />
              <Button type="submit" variant="secondary">
                <X aria-hidden size={16} />
                Odebrat
              </Button>
            </form>
          </div>
        ))}
      </div>

      <MediaLightbox
        item={selected}
        onClose={() => setSelected(null)}
        onPrev={(() => {
          const i = selected ? media.findIndex((m) => m.id === selected.id) : -1;
          return i > 0 ? () => setSelected(media[i - 1]) : undefined;
        })()}
        onNext={(() => {
          const i = selected ? media.findIndex((m) => m.id === selected.id) : -1;
          return i >= 0 && i < media.length - 1 ? () => setSelected(media[i + 1]) : undefined;
        })()}
      />
    </>
  );
}

export default CollectionGallery;
