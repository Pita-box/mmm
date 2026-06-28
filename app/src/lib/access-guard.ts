/**
 * Access-guard — serverový (Node) strážce přístupu pro route handlery a server
 * actions (task 21.1).
 *
 * Na rozdíl od Edge middlewaru má Node runtime přístup k Prisma, a tak doplňuje
 * rozhodnutí o mapu viditelnosti sekcí z DB (R16.3 — globálně skrytá sekce ⇒ 404).
 * Tento modul **úmyslně neimportuje** Edge middleware, takže Prisma zůstává mimo
 * Edge bundle. `decideAccess` (přes `evaluateAccess`) zůstává autoritou rozhodnutí.
 */
import type { NextRequest, NextResponse } from "next/server";
import type { AccessDecision } from "./access";
import { evaluateAccess, SESSION_COOKIE } from "./access-context";
import { accessDecisionToResponse } from "./access-response";
import { pageVisibilityService } from "@/services/page-visibility-service";

/**
 * Vyhodnotí přístup **včetně** mapy viditelnosti sekcí čtené z DB. Vhodné pro
 * server komponenty a místa, kde je potřeba samotné rozhodnutí (ne HTTP odpověď).
 */
export async function evaluateAccessWithVisibility(input: {
  path: string;
  rawCookie: string | undefined | null;
  now?: Date;
}): Promise<AccessDecision> {
  const hiddenSections = await pageVisibilityService.getHiddenSections();
  return evaluateAccess({ ...input, hiddenSections });
}

/**
 * Serverový strážce pro route handlery a server actions. Vrátí `NextResponse`
 * při odepření, nebo `null` pokud je přístup povolen (volající pak pokračuje
 * vlastní logikou). Příklad:
 *
 * ```ts
 * export async function GET(request: NextRequest) {
 *   const denied = await enforceAccess(request);
 *   if (denied) return denied;
 *   // … autorizovaná logika …
 * }
 * ```
 */
export async function enforceAccess(
  request: NextRequest,
): Promise<NextResponse | null> {
  const decision = await evaluateAccessWithVisibility({
    path: request.nextUrl.pathname,
    rawCookie: request.cookies.get(SESSION_COOKIE)?.value,
  });
  if (decision.outcome === "allow") return null;
  return accessDecisionToResponse(decision, request);
}
