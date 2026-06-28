// Feature: mmmred-streaming-dashboard, Property 16: Validace nahrávaného souboru
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { validateUpload, MAX_UPLOAD_BYTES, type UploadMeta } from "./media-service";

/**
 * Property 16: Validace nahrávaného souboru.
 *
 * Pro libovolnou dvojici (formát, velikost) platí, že nahrání je přijato právě
 * tehdy, když je formát podporovaný a velikost ≤ 500 MB; jinak je odmítnuto
 * s uvedením důvodu a nevznikne Media_Item. Formulováno jako ekvivalence (iff):
 *
 *   validateUpload({ mimeType, sizeBytes }).ok === true
 *     ⟺  (mimeType je podporovaný formát)  ∧  (sizeBytes ≤ MAX_UPLOAD_BYTES)
 *
 * Při odmítnutí (ok === false) musí chyba nést konkrétní důvod (`code`)
 * a lidsky čitelnou zprávu — validace je čistá, žádný Media_Item nevzniká.
 *
 * **Validates: Requirements 5.3**
 */

/** Podporované foto MIME typy (R5.2). */
const PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
/** Podporované video MIME typy (R5.2): MOV = video/quicktime. */
const VIDEO_MIME_TYPES = ["video/mp4", "video/quicktime", "video/webm"] as const;

/** Normalizace shodná s implementací (trim + lowercase) pro rozhodnutí o příslušnosti. */
const normalize = (s: string) => s.trim().toLowerCase();
const SUPPORTED_SET = new Set<string>([...PHOTO_MIME_TYPES, ...VIDEO_MIME_TYPES]);
const isSupported = (mime: string) => SUPPORTED_SET.has(normalize(mime));

/** Generátor podporovaných MIME typů (foto i video). */
const supportedMimeArb = fc.constantFrom(...PHOTO_MIME_TYPES, ...VIDEO_MIME_TYPES);

/** Generátor libovolných nepodporovaných řetězců (po normalizaci mimo podporovanou množinu). */
const unsupportedMimeArb = fc.string().filter((s) => !isSupported(s));

/** Generátor MIME — mix podporovaných i nepodporovaných, aby pokryl obě větve. */
const mimeArb = fc.oneof(supportedMimeArb, unsupportedMimeArb);

/**
 * Generátor velikostí soustředěný kolem hranice 500 MB (± několik bajtů),
 * doplněný o širší rozsah od 0 až daleko za limit, aby pokryl obě strany hranice.
 */
const sizeArb = fc.oneof(
  // přesně kolem hranice
  fc.constantFrom(
    MAX_UPLOAD_BYTES - 1,
    MAX_UPLOAD_BYTES,
    MAX_UPLOAD_BYTES + 1,
    0,
  ),
  // širší rozsah pod i nad limitem
  fc.integer({ min: 0, max: MAX_UPLOAD_BYTES * 2 }),
);

describe("Property 16: Validace nahrávaného souboru", () => {
  it("přijme nahrání právě tehdy, když je formát podporovaný a velikost ≤ 500 MB; jinak odmítne s důvodem", () => {
    fc.assert(
      fc.property(mimeArb, sizeArb, (mimeType, sizeBytes) => {
        const file: UploadMeta = { mimeType, sizeBytes };
        const result = validateUpload(file);

        const shouldAccept = isSupported(mimeType) && sizeBytes <= MAX_UPLOAD_BYTES;

        expect(result.ok).toBe(shouldAccept);

        if (!result.ok) {
          // Odmítnutí musí nést konkrétní důvod a zprávu (nevzniká Media_Item).
          expect(["unsupported_format", "file_too_large"]).toContain(result.error.code);
          expect(typeof result.error.message).toBe("string");
          expect(result.error.message.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 100 },
    );
  });
});
