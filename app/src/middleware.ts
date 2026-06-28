/**
 * Next.js Edge middleware — vynucení přístupu na příchozí požadavky (task 21.1).
 *
 * Sestaví `RequestContext` z `NextRequest` (cesta, API vs. stránka, podepsaná
 * relace z cookie) a předá ho čisté autoritě `decideAccess`. Výsledek se mapuje
 * na `NextResponse`: stránky dostávají redirecty (Sign In / Paywall), API
 * dostává stavové kódy 401/403/404. Režim platební bariéry řídí `PAYMENTS_ENABLED`
 * (R21.1, R21.3, R21.5).
 *
 * Viditelnost sekcí (R16.3 → 404) se v Edge runtime nečte z DB; tu vynucuje
 * Node strážce `enforceAccess` v route handlerech / server komponentách
 * (viz `@/lib/access-response`). Middleware pokrývá autentizaci, role a redirecty
 * (R1.1, R1.2, R1.4, R1.5, R3.3, R21.4, R21.5).
 */
import type { NextRequest } from "next/server";
import { evaluateAccess, SESSION_COOKIE } from "@/lib/access-context";
import { accessDecisionToResponse } from "@/lib/access-response";

export async function middleware(request: NextRequest): Promise<Response> {
  const { pathname } = request.nextUrl;
  const decision = await evaluateAccess({
    path: pathname,
    rawCookie: request.cookies.get(SESSION_COOKIE)?.value,
    // hiddenSections se v Edge nečtou z DB — viz enforceAccess (Node) v route handlerech.
  });
  return accessDecisionToResponse(decision, request);
}

/**
 * Rozsah middlewaru: všechny cesty kromě statických assetů a interních cest
 * Next.js. Vylučuje `_next/static`, `_next/image`, `favicon.ico` a jakýkoli
 * soubor s příponou (`.*\\..*`). API cesty (`/api/**`) zahrnuty zůstávají.
 */
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
