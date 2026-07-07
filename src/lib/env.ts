/**
 * Produkční pojistka tajných klíčů (plán 001).
 *
 * Jediná startovní kontrola: v produkci selže fail-fast, pokud je některý
 * podpisový klíč chybějící, slabý (<32 znaků) nebo placeholder. V dev/test je
 * no-op (placeholdery lokálně povolené).
 *
 * ponytail: jediný guard u startu; per-call placeholder kontroly v
 * access-context/drive-connector by byly redundantní (pokrývá je tahle pojistka).
 */
const PLACEHOLDER = /^dev-only-change-me/;

function isWeak(value: string | undefined): boolean {
  return value === undefined || value.length < 32 || PLACEHOLDER.test(value);
}

/** V produkci vyhodí chybu při chybějícím/slabém podpisovém klíči; jinak no-op. */
export function assertProductionSecrets(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env.NODE_ENV !== "production") return;
  const weak = (["SESSION_COOKIE_SECRET", "STREAMING_TOKEN_SECRET"] as const).filter(
    (key) => isWeak(env[key]),
  );
  if (weak.length > 0) {
    throw new Error(
      `Slabý nebo chybějící podpisový klíč v produkci: ${weak.join(", ")}. ` +
        `Nastav vysokou entropií (>=32 znaků), např. openssl rand -base64 48.`,
    );
  }
}
