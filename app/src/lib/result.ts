/**
 * Result<T, E> — typovaný výsledek operace (success/failure) používaný všemi
 * službami. Služby nikdy nevyhazují neočekávané výjimky přes svou hranici;
 * místo toho vracejí `Result`, který volající (route handler / server action)
 * mapuje na HTTP odpověď.
 *
 * Discriminated union nad polem `ok` umožňuje TypeScriptu zúžit typ:
 *
 *   const r = service.doThing();
 *   if (isOk(r)) {
 *     r.value; // T
 *   } else {
 *     r.error; // E
 *   }
 */

export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err<E> = { readonly ok: false; readonly error: E };

export type Result<T, E> = Ok<T> | Err<E>;

/** Vytvoří úspěšný výsledek. Pro `Result<void, E>` lze volat bez argumentu. */
export function ok(): Ok<void>;
export function ok<T>(value: T): Ok<T>;
export function ok<T>(value?: T): Ok<T> {
  return { ok: true, value: value as T };
}

/** Vytvoří chybový výsledek. */
export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

/** Type guard: je výsledek úspěšný? */
export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok;
}

/** Type guard: je výsledek chybový? */
export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return !result.ok;
}

/**
 * Vrátí hodnotu úspěšného výsledku, nebo zadanou náhradu při chybě.
 * Užitečné pro čistou logiku, která nepotřebuje detail chyby.
 */
export function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
  return result.ok ? result.value : fallback;
}

/** Transformuje úspěšnou hodnotu, chybu ponechá beze změny. */
export function mapResult<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => U,
): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result;
}
