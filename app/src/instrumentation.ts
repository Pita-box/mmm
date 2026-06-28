/**
 * Next.js startovní hook — spustí produkční pojistku tajných klíčů (plán 001).
 * Volá se jednou při startu serveru.
 */
import { assertProductionSecrets } from "@/lib/env";

export function register(): void {
  assertProductionSecrets();
}
