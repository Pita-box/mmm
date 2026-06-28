// Feature: mmmred-streaming-dashboard, Property 23: Neautorizovaný požadavek nevygeneruje token a zdroj se neodhalí
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  issueStreamingToken,
  toPublicMedia,
  DRIVE_DOMAINS,
  type IssueTokenParams,
  type MediaItemRecord,
} from "./drive-connector";
import type { MediaType, MediaStatus } from "@/lib/domain";

/**
 * Property 23: Neautorizovaný požadavek nevygeneruje token a zdroj se neodhalí.
 *
 * Pro libovolný neautorizovaný požadavek na přehrání platí, že nevznikne žádná
 * Streaming_URL (token); a pro libovolnou mediální odpověď serializovanou
 * klientovi platí, že neobsahuje trvalý odkaz na soubor Google Drive
 * (`driveFileId` ani drive doménu).
 *
 * **Validates: Requirements 6.2, 6.4**
 *
 * Pracuje výhradně s čistými funkcemi `issueStreamingToken` a `toPublicMedia`
 * bez I/O (žádná DB, žádný Drive). Pevný `secret` slouží jen k podpisu —
 * neautorizovaná větev token nikdy nepodepíše.
 */

const TEST_SECRET = "test-secret-for-property-23";

const MEDIA_TYPES: readonly MediaType[] = ["photo", "video"];
const MEDIA_STATUSES: readonly MediaStatus[] = ["scheduled", "published", "hidden"];

// MIME typy odpovídající podporovaným formátům (R5.2); žádný neobsahuje drive doménu.
const MIME_TYPES: readonly string[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/quicktime",
  "video/webm",
];

/**
 * Generátor "neautorizované" identity: chybějící nebo prázdný `userId`.
 * Pokrývá `undefined`, `null`, prázdný řetězec a řetězce tvořené jen
 * bílými znaky (které `issueStreamingToken` po trim považuje za prázdné).
 */
function unauthorizedUserIdArb(): fc.Arbitrary<string | null | undefined> {
  return fc.oneof(
    fc.constant(undefined),
    fc.constant(null),
    fc.constant(""),
    fc.stringMatching(/^[ \t\n\r]+$/),
  );
}

/**
 * Smart generátor trvalého odkazu na Drive (`driveFileId`).
 *
 * Hodnota nese jednoznačný prefix `SECRET-DRIVE-`, který se v ostatních polích
 * (generovaných jako UUID / pevné MIME typy) nikdy nevyskytuje — jakýkoli jeho
 * výskyt v serializaci by tedy byl skutečný únik, ne náhodná shoda podřetězce.
 * Část variant navíc obsahuje drive doménu, aby se ověřilo, že neunikne ani ta.
 */
function driveFileIdArb(): fc.Arbitrary<string> {
  return fc.oneof(
    fc.hexaString({ minLength: 1, maxLength: 40 }).map((s) => `SECRET-DRIVE-${s}`),
    fc
      .tuple(fc.constantFrom(...DRIVE_DOMAINS), fc.hexaString({ minLength: 1, maxLength: 24 }))
      .map(([domain, s]) => `SECRET-DRIVE-https://${domain}/file/${s}`),
  );
}

function mediaItemRecordArb(): fc.Arbitrary<MediaItemRecord> {
  return fc.record({
    id: fc.uuid(),
    modelId: fc.uuid(),
    driveFileId: driveFileIdArb(),
    mediaType: fc.constantFrom(...MEDIA_TYPES),
    mimeType: fc.constantFrom(...MIME_TYPES),
    sizeBytes: fc.integer({ min: 0, max: 500 * 1024 * 1024 }),
    status: fc.constantFrom(...MEDIA_STATUSES),
    publishAt: fc.option(fc.date({ min: new Date(0), max: new Date(4_000_000_000_000) }), {
      nil: null,
    }),
    width: fc.integer({ min: 1, max: 10_000 }),
    height: fc.integer({ min: 1, max: 10_000 }),
    createdAt: fc.date({ min: new Date(0), max: new Date(4_000_000_000_000) }),
  });
}

describe("Property 23: Neautorizovaný požadavek nevygeneruje token a zdroj se neodhalí", () => {
  it("neautorizovaný požadavek (chybějící/prázdný userId) nevygeneruje žádný token", () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        unauthorizedUserIdArb(),
        fc.date(),
        (mediaId, userId, now) => {
          const params: IssueTokenParams = { mediaId, userId, now };
          const result = issueStreamingToken(params, TEST_SECRET);

          // Žádný token nevznikne — výsledek je chyba `unauthorized`.
          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.error.code).toBe("unauthorized");
          }
          // Defenzivně: ve výsledku není přítomna žádná hodnota tokenu.
          expect(result).not.toHaveProperty("value");
        },
      ),
      { numRuns: 100 },
    );
  });

  it("serializovaná mediální odpověď neobsahuje driveFileId ani drive doménu", () => {
    fc.assert(
      fc.property(mediaItemRecordArb(), (item) => {
        const publicItem = toPublicMedia(item);

        // 1) Výstupní objekt nemá vlastnost `driveFileId`.
        expect(Object.prototype.hasOwnProperty.call(publicItem, "driveFileId")).toBe(false);

        // 2) Serializace klientovi neobsahuje trvalý odkaz (hodnotu driveFileId).
        const serialized = JSON.stringify(publicItem);
        expect(serialized).not.toContain(item.driveFileId);

        // 3) Serializace neobsahuje žádnou doménu Google Drive.
        for (const domain of DRIVE_DOMAINS) {
          expect(serialized).not.toContain(domain);
        }

        // 4) Všechna neutajená pole zůstávají zachována (serializace je užitečná).
        expect(publicItem.id).toBe(item.id);
        expect(publicItem.modelId).toBe(item.modelId);
        expect(publicItem.mediaType).toBe(item.mediaType);
        expect(publicItem.mimeType).toBe(item.mimeType);
      }),
      { numRuns: 100 },
    );
  });
});
