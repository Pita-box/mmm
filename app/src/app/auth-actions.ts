"use server";

/**
 * Server actions autentizace (task 21.2, R2.5).
 *
 * Mapují `Result` z Auth_Service na stav formuláře (chybová hláška) nebo na
 * redirect. Po úspěšném přihlášení/registraci se vydá podepsané session cookie
 * (R2.5) sestavené z aktuálního stavu účtu; odhlášení cookie smaže. Chyby jsou
 * generické tam, kde to vyžaduje R2.4 (Auth_Service už hlášku formuluje).
 */
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { isErr } from "@/lib/result";
import { authService } from "@/services/auth-service";
import { establishSession, clearSession, getSessionPrincipal } from "@/lib/session";
import type { SessionPrincipal } from "@/lib/access-context";

/** Stav auth formuláře vracený do `useActionState`. */
export interface AuthFormState {
  readonly error: string | null;
}

/** Zajistí, že redirect cíl je lokální cesta (ochrana před open-redirect). */
function safeCallback(raw: FormDataEntryValue | null): string {
  const value = typeof raw === "string" ? raw : "/";
  // Povolíme jen jednoduché absolutní cesty; jinak fallback na kořen.
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  return "/";
}

/**
 * Přihlásí uživatele a vydá session cookie. Vrací chybovou hlášku, nebo `null`
 * při úspěchu (cookie nastaveno).
 */
async function startSession(
  email: string,
  password: string,
): Promise<string | null> {
  const login = await authService.login({ email, password });
  if (isErr(login)) return login.error.message;

  const user = await prisma.user.findUnique({
    where: { id: login.value.userId },
    select: {
      id: true,
      role: true,
      status: true,
      subscriptionStatus: true,
    },
  });
  if (user === null) return "Účet nebyl nalezen.";

  const principal: SessionPrincipal = {
    userId: user.id,
    sessionId: login.value.id,
    role: user.role,
    accountStatus: user.status,
    subscriptionStatus: user.subscriptionStatus,
    lastActivityAt: login.value.lastActivityAt.toISOString(),
  };

  const issued = await establishSession(principal);
  if (!issued) {
    return "Relaci se nepodařilo vytvořit. Kontaktujte správce.";
  }
  return null;
}

/** Přihlášení (R2.3, R2.4). Úspěch → redirect na callbackUrl. */
export async function signInAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const error = await startSession(email, password);
  if (error !== null) return { error };
  redirect(safeCallback(formData.get("callbackUrl")));
}

/** Registrace (R2.1, R2.2, R2.7). Úspěch → přihlášení a redirect. */
export async function signUpAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const registered = await authService.register({ email, password });
  if (isErr(registered)) return { error: registered.error.message };

  const error = await startSession(email, password);
  if (error !== null) return { error };
  redirect(safeCallback(formData.get("callbackUrl")));
}

/** Odhlášení (R2.5) — smaže DB session i cookie a přesměruje na Sign In. */
export async function signOutAction(): Promise<void> {
  const principal = await getSessionPrincipal();
  if (principal !== null) {
    await prisma.session.deleteMany({ where: { id: principal.sessionId } });
  }
  await clearSession();
  redirect("/signin");
}
