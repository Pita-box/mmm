// Feature: mmmred-streaming-dashboard, Property 26: Limit počtu hodnot v kategorii na jedno médium
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  checkCategoryLimit,
  MAX_VALUES_PER_CATEGORY,
} from "./tag-service";
import { isOk, isErr } from "@/lib/result";

/**
 * Property 26: Limit počtu hodnot v kategorii na jedno médium.
 *
 * Pro libovolný výsledný počet různých Tag_Value v rámci jedné kategorie u
 * jednoho média platí: přiřazení je povoleno právě tehdy, když je výsledný
 * počet ≤ 50 (MAX_VALUES_PER_CATEGORY). Jakýkoli pokus, který by vedl k více
 * než 50 hodnotám, je odmítnut chybou `category_limit_exceeded`.
 *
 * **Validates: Requirements 7.6**
 */
describe("Property 26: limit počtu hodnot v kategorii na médium", () => {
  it("povolí právě tehdy, když výsledný počet ≤ 50, jinak category_limit_exceeded", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100 }), (resultingCount) => {
        const result = checkCategoryLimit(resultingCount);

        if (resultingCount <= MAX_VALUES_PER_CATEGORY) {
          expect(isOk(result)).toBe(true);
        } else {
          expect(isErr(result)).toBe(true);
          if (isErr(result)) {
            expect(result.error.code).toBe("category_limit_exceeded");
            if (result.error.code === "category_limit_exceeded") {
              expect(result.error.limit).toBe(MAX_VALUES_PER_CATEGORY);
            }
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});
