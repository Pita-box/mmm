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
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { isErr } from "@/lib/result";
import { authService } from "@/services/auth-service";
import { buildTelegramNewSignupMessage } from "@/services/telegram-community-service";
import { createTelegramBroadcastService } from "@/services/telegram-broadcast-service";
import { establishSession, clearSession, getSessionPrincipal } from "@/lib/session";
import type { SessionPrincipal } from "@/lib/access-context";

const telegramService = createTelegramBroadcastService({
  config: {
    botToken: process.env.MMM_TELEGRAM_BOT_TOKEN,
    chatId: process.env.MMM_TELEGRAM_CHAT_ID,
    defaultThreadId: process.env.TELEGRAM_THREAD_GENERAL,
    botApiBaseUrl: process.env.TELEGRAM_BOT_API_BASE_URL,
  },
});

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
  rememberMe = false,
): Promise<string | null> {
  const login = await authService.login({ email, password, rememberMe });
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
  if (user === null) return "Account not found.";

  const principal: SessionPrincipal = {
    userId: user.id,
    sessionId: login.value.id,
    role: user.role,
    accountStatus: user.status,
    subscriptionStatus: user.subscriptionStatus,
    lastActivityAt: login.value.lastActivityAt.toISOString(),
    rememberMe,
  };

  const issued = await establishSession(principal);
  if (!issued) {
    return "Failed to create the session. Contact the administrator.";
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
  const rememberMe = formData.get("rememberMe") === "on";
  const error = await startSession(email, password, rememberMe);
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

  after(async () => {
    const notified = await telegramService.sendMessage({
      chatId: process.env.MMM_TELEGRAM_CHAT_ID ?? "",
      threadId: process.env.TELEGRAM_THREAD_GENERAL,
      text: buildTelegramNewSignupMessage(registered.value.email),
    });
    if (!notified.ok) {
      console.error("Telegram signup notification failed", {
        email: registered.value.email,
        message: notified.error.message,
      });
    }
  });

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
