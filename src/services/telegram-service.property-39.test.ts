// Feature: mmmred-streaming-dashboard, Property 39: Přesměrování na Telegram dle platnosti URL
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { resolveTelegramRedirect } from "./telegram-service";
import { isValidUrl } from "@/lib/validation";
import { isOk, isErr } from "@/lib/result";

/**
 * Property 39: Přesměrování na Telegram dle platnosti URL
 * Validates: Requirements 19.1, 19.3
 *
 * Pro libovolnou nakonfigurovanou hodnotu URL platí, že `resolveTelegramRedirect`
 * vrátí přesměrování (Ok s cílem `_blank`) *právě tehdy*, když je hodnota
 * neprázdný řetězec s platným formátem URL (`isValidUrl`). Jinak se přesměrování
 * zruší a vrátí se chyba `destination_unavailable`.
 */
describe("Property 39: Přesměrování na Telegram dle platnosti URL", () => {
  // Generátor mixu vstupů: platné URL se schématem, holé řetězce, prázdné,
  // whitespace a chybějící hodnoty (null/undefined).
  const validUrlArb = fc
    .webUrl({ withQueryParameters: true, withFragments: true })
    .map((u) => u as string | null | undefined);

  const bareStringArb = fc
    .string()
    .filter((s) => !s.includes("://")) as fc.Arbitrary<string | null | undefined>;

  const whitespaceArb = fc
    .stringOf(fc.constantFrom(" ", "\t", "\n", "\r"), { minLength: 1, maxLength: 5 })
    .map((s) => s as string | null | undefined);

  const emptyArb = fc.constant("" as string | null | undefined);
  const nullishArb = fc.constantFrom(null, undefined) as fc.Arbitrary<
    string | null | undefined
  >;

  const configuredUrlArb = fc.oneof(
    validUrlArb,
    bareStringArb,
    whitespaceArb,
    emptyArb,
    nullishArb,
  );

  it("přesměruje právě tehdy, když je URL neprázdný platný řetězec", () => {
    fc.assert(
      fc.property(configuredUrlArb, (configuredUrl) => {
        const result = resolveTelegramRedirect(configuredUrl);

        const shouldRedirect =
          typeof configuredUrl === "string" &&
          configuredUrl.length > 0 &&
          isValidUrl(configuredUrl);

        if (shouldRedirect) {
          expect(isOk(result)).toBe(true);
          if (isOk(result)) {
            expect(result.value.url).toBe(configuredUrl);
            expect(result.value.target).toBe("_blank");
          }
        } else {
          expect(isErr(result)).toBe(true);
          if (isErr(result)) {
            expect(result.error.code).toBe("destination_unavailable");
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});
