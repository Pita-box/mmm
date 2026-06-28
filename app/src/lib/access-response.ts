/**
 * Mapování čistého `AccessDecision` na `NextResponse` (task 21.1).
 *
 * Sdílené Edge middlewarem i Node route handlery. Stránky dostávají redirecty
 * (Sign In / Paywall) nebo HTML stavové odpovědi; API dostává JSON se stavovým
 * kódem 401/403/404. `decideAccess` zůstává autoritou rozhodnutí — zde se jen
 * překládá výsledek na HTTP odpověď.
 */
import { NextResponse, type NextRequest } from "next/server";
import type { AccessDecision } from "./access";
import { isApiPath } from "./access-context";

/** Sestaví absolutní URL vůči původu požadavku. */
function urlFrom(request: NextRequest, pathname: string): URL {
  return new URL(pathname, request.nextUrl.origin);
}

function jsonError(status: number, message: string): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Přeloží rozhodnutí na `NextResponse`. Pro `allow` vrací `NextResponse.next()`
 * (požadavek pokračuje). API odepření jsou JSON + stavový kód; stránková
 * odepření jsou redirecty (401/inaktivita → Sign In, předplatné → Paywall)
 * nebo prostá stavová odpověď (403/404).
 */
export function accessDecisionToResponse(
  decision: AccessDecision,
  request: NextRequest,
): NextResponse {
  const isApi = isApiPath(request.nextUrl.pathname);

  switch (decision.outcome) {
    case "allow":
      return NextResponse.next();

    case "redirectSignIn": {
      // API: neautentizovaný požadavek dostane 401, ne redirect (R21.5).
      if (isApi) return jsonError(401, "Authentication required.");
      const target = urlFrom(request, "/signin");
      target.searchParams.set(
        "callbackUrl",
        decision.callbackUrl ?? request.nextUrl.pathname,
      );
      return NextResponse.redirect(target);
    }

    case "redirectPaywall": {
      if (isApi) return jsonError(402, "Active subscription required.");
      return NextResponse.redirect(urlFrom(request, "/paywall"));
    }

    case "deny401":
      return jsonError(401, "Authentication required.");

    case "deny403":
      return isApi
        ? jsonError(403, "Forbidden.")
        : new NextResponse("Forbidden", { status: 403 });

    case "deny404":
      return isApi
        ? jsonError(404, "Not found.")
        : new NextResponse("Not found", { status: 404 });

    default: {
      // Vyčerpávající switch — kompilátor ohlídá nové varianty výsledku.
      const _exhaustive: never = decision.outcome;
      return _exhaustive;
    }
  }
}
