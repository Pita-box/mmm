// Feature: mmmred-streaming-dashboard, Property 15: Klasifikace typu média podle formátu
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { classifyType } from "./media-service";

/**
 * Property 15: Klasifikace typu média podle formátu.
 *
 * Pro libovolný MIME typ platí, že je klasifikován jako foto právě pro
 * JPEG/PNG/WebP, jako video právě pro MP4/MOV/WebM, a jako nepodporovaný
 * (`null`) jinak. Vlastnost je formulována jako ekvivalence (iff):
 *   classifyType(mime) === "photo"  ⟺  mime ∈ PHOTO_SET
 *   classifyType(mime) === "video"  ⟺  mime ∈ VIDEO_SET
 *   classifyType(mime) === null     ⟺  mime ∉ (PHOTO_SET ∪ VIDEO_SET)
 *
 * **Validates: Requirements 5.2**
 */

/** Známé podporované foto MIME typy (R5.2). */
const PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** Známé podporované video MIME typy (R5.2): MOV = video/quicktime. */
const VIDEO_MIME_TYPES = ["video/mp4", "video/quicktime", "video/webm"] as const;

/** Normalizace shodná s implementací (trim + lowercase) pro rozhodnutí o příslušnosti. */
const normalize = (s: string) => s.trim().toLowerCase();
const PHOTO_SET = new Set<string>(PHOTO_MIME_TYPES);
const VIDEO_SET = new Set<string>(VIDEO_MIME_TYPES);

/** Generátor známých podporovaných MIME typů (foto i video). */
const supportedMimeArb = fc.constantFrom(...PHOTO_MIME_TYPES, ...VIDEO_MIME_TYPES);

/**
 * Generátor libovolných ostatních řetězců, u nichž po normalizaci zaručeně
 * nejde o žádný podporovaný typ — tím pokrýváme větev „nepodporovaný (null)".
 */
const otherStringArb = fc
  .string()
  .filter((s) => !PHOTO_SET.has(normalize(s)) && !VIDEO_SET.has(normalize(s)));

describe("Property 15: Klasifikace typu média podle formátu", () => {
  it("klasifikuje foto/video/null přesně podle příslušnosti k podporovaným MIME množinám", () => {
    fc.assert(
      fc.property(fc.oneof(supportedMimeArb, otherStringArb), (mime) => {
        const result = classifyType(mime);
        const n = normalize(mime);

        if (PHOTO_SET.has(n)) {
          // foto právě pro JPEG/PNG/WebP
          expect(result).toBe("photo");
        } else if (VIDEO_SET.has(n)) {
          // video právě pro MP4/MOV/WebM
          expect(result).toBe("video");
        } else {
          // nepodporovaný typ jinak
          expect(result).toBeNull();
        }
      }),
      { numRuns: 100 },
    );
  });
});
