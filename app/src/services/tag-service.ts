/**
 * Tag_Service — jádro štítkovacího systému (task 11.1).
 *
 * Soubor odděluje **čisté jádro** (normalizace, validace kategorie i hodnoty,
 * guard limitu) od **perzistentní vrstvy** (Prisma). Čisté funkce jsou bez I/O,
 * deterministické a přímo testovatelné generátory (PBT tasky 11.2–11.4).
 * Perzistentní operace jsou vystaveny přes `createTagService(prisma)` a vracejí
 * `Result<…, TagError>` — nikdy nevyhazují výjimku přes svou hranici.
 *
 * Pravidla (viz requirements.md, R7):
 *  - Kategorie tvoří pevnou, neměnnou množinu 6 hodnot (FIXED_CATEGORIES); mimo
 *    ni nelze žádnou vytvořit (R7.1, R7.7).
 *  - Nová hodnota se po odstranění okrajových mezer musí vejít do délky 1..100
 *    (R7.3); ukládá se trimovaná podoba (zachování velikosti písmen pro zobrazení),
 *    porovnání a unikátnost běží nad `normalizedValue` (trim + lower) (R7.2).
 *  - Hodnota, která v dané kategorii už existuje (case-insensitive), se znovu
 *    použije místo duplikace — počet hodnot v kategorii nevzroste (R7.4).
 *  - K jednomu médiu lze v rámci jedné kategorie přiřadit 1..50 různých hodnot
 *    (R7.6).
 */
import type { PrismaClient, TagValue } from "@prisma/client";
import { FIXED_CATEGORIES, type TagCategory } from "@/lib/domain";
import type { TagError } from "@/lib/errors";
import { ok, err, isErr, type Result } from "@/lib/result";

// ─── Konstanty ────────────────────────────────────────────────────────────────

/** Minimální délka hodnoty štítku po trim (R7.3). */
export const MIN_TAG_VALUE_LENGTH = 1;

/** Maximální délka hodnoty štítku po trim (R7.3). */
export const MAX_TAG_VALUE_LENGTH = 100;

/** Maximální počet různých hodnot v jedné kategorii na jedno médium (R7.6). */
export const MAX_VALUES_PER_CATEGORY = 50;

// ─── Čisté jádro ───────────────────────────────────────────────────────────────

/**
 * Normalizační/porovnávací klíč hodnoty štítku (R7.2): odstraní okrajové mezery
 * a převede na malá písmena. Slouží jako `normalizedValue` pro unikátnost a
 * deduplikaci v rámci kategorie (porovnání bez ohledu na velikost písmen).
 */
export function normalize(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Type guard nad pevnou množinou kategorií (R7.1, R7.7). Vrací true právě tehdy,
 * když je `name` jednou z 6 fixních kategorií. Jakákoli jiná hodnota je odmítnuta.
 */
export function isValidCategory(name: string): name is TagCategory {
  return (FIXED_CATEGORIES as readonly string[]).includes(name);
}

/** Výsledek validace hodnoty: trimovaná podoba pro zobrazení + porovnávací klíč. */
export interface ValidatedTagValue {
  /** Trimovaná hodnota tak, jak se uloží (zachovává velikost písmen). */
  readonly value: string;
  /** Normalizovaný klíč (trim + lower) pro unikátnost/deduplikaci. */
  readonly normalizedValue: string;
}

/**
 * Validace hodnoty štítku (R7.3): po odstranění okrajových mezer musí mít délku
 * 1..100 znaků. Prázdná po trim nebo > 100 znaků se odmítá. Vrací trimovanou
 * podobu a normalizovaný klíč; tato funkce je čistá (bez I/O).
 */
export function validateTagValue(raw: string): Result<ValidatedTagValue, TagError> {
  const value = raw.trim();
  if (value.length < MIN_TAG_VALUE_LENGTH || value.length > MAX_TAG_VALUE_LENGTH) {
    return err({
      code: "validation",
      field: "value",
      message: `Hodnota štítku musí mít po odstranění mezer ${MIN_TAG_VALUE_LENGTH}–${MAX_TAG_VALUE_LENGTH} znaků.`,
    });
  }
  return ok({ value, normalizedValue: value.toLowerCase() });
}

/**
 * Guard limitu počtu hodnot v kategorii na médium (R7.6): výsledný počet různých
 * hodnot v rámci jedné kategorie u jednoho média nesmí překročit 50. Funkce je
 * čistá — volající jí předá počet hodnot, který by po přiřazení vznikl.
 */
export function checkCategoryLimit(resultingDistinctCount: number): Result<void, TagError> {
  if (resultingDistinctCount > MAX_VALUES_PER_CATEGORY) {
    return err({
      code: "category_limit_exceeded",
      limit: MAX_VALUES_PER_CATEGORY,
      message: `V jedné kategorii lze médiu přiřadit nejvýše ${MAX_VALUES_PER_CATEGORY} hodnot.`,
    });
  }
  return ok();
}

// ─── Perzistentní vrstva ────────────────────────────────────────────────────────

export interface TagService {
  normalize(raw: string): string;
  isValidCategory(name: string): name is TagCategory;
  /**
   * Uloží novou hodnotu (1..100 po trim) v dané kategorii, nebo vrátí existující
   * (case-insensitive shoda) bez vytvoření duplikátu (R7.2/7.3/7.4/7.7).
   */
  upsertValue(category: string, raw: string): Promise<Result<TagValue, TagError>>;
  /**
   * Přiřadí hodnotu štítku k médiu; idempotentní (opakované přiřazení nic nezmění)
   * a vynucuje limit 1..50 různých hodnot v kategorii na médium (R7.5, R7.6).
   */
  assignValueToMedia(
    mediaId: string,
    tagValueId: string,
  ): Promise<Result<void, TagError>>;
  /**
   * Odebere přiřazení hodnoty štítku od média (idempotentní — neexistující
   * vazba není chyba). Pro editaci metadat média v adminu (plán 011).
   */
  removeValueFromMedia(
    mediaId: string,
    tagValueId: string,
  ): Promise<Result<void, TagError>>;
}

const INVALID_CATEGORY: TagError = {
  code: "invalid_category",
  message: "Neplatná kategorie štítku.",
};

const TAG_VALUE_NOT_FOUND: TagError = {
  code: "validation",
  field: "tagValueId",
  message: "Hodnota štítku neexistuje.",
};

/**
 * Vytvoří instanci Tag_Service nad daným Prisma klientem. Čisté funkce jsou
 * vystaveny i jako samostatné exporty (pro PBT bez I/O).
 */
export function createTagService(prisma: PrismaClient): TagService {
  return {
    normalize,
    isValidCategory,

    async upsertValue(category, raw) {
      if (!isValidCategory(category)) return err(INVALID_CATEGORY);

      const validated = validateTagValue(raw);
      if (isErr(validated)) return validated;
      const { value, normalizedValue } = validated.value;

      // Deduplikace přes unikátní (category, normalizedValue): existující hodnotu
      // znovu použijeme místo vytvoření duplikátu (R7.4) — počet nevzroste.
      const existing = await prisma.tagValue.findUnique({
        where: { category_normalizedValue: { category, normalizedValue } },
      });
      if (existing !== null) return ok(existing);

      const created = await prisma.tagValue.create({
        data: { category, value, normalizedValue },
      });
      return ok(created);
    },

    async assignValueToMedia(mediaId, tagValueId) {
      const tagValue = await prisma.tagValue.findUnique({ where: { id: tagValueId } });
      if (tagValue === null) return err(TAG_VALUE_NOT_FOUND);

      // Idempotence: je-li hodnota k médiu už přiřazena, nic se nemění (R7.5).
      const already = await prisma.mediaTag.findUnique({
        where: { mediaId_tagValueId: { mediaId, tagValueId } },
      });
      if (already !== null) return ok();

      // Limit 1..50 různých hodnot v rámci kategorie na médium (R7.6): spočítáme
      // aktuální počet hodnot dané kategorie u média a ověříme stav po přidání.
      const currentInCategory = await prisma.mediaTag.count({
        where: { mediaId, tagValue: { category: tagValue.category } },
      });
      const guard = checkCategoryLimit(currentInCategory + 1);
      if (isErr(guard)) return guard;

      await prisma.mediaTag.create({ data: { mediaId, tagValueId } });
      return ok();
    },

    async removeValueFromMedia(mediaId, tagValueId) {
      // Idempotentní: neexistující vazba není chyba (deleteMany smaže 0..1).
      await prisma.mediaTag.deleteMany({ where: { mediaId, tagValueId } });
      return ok();
    },
  };
}
