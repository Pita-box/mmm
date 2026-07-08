"use client";

/**
 * AuthForm — sdílený formulář pro Sign In / Sign Up (task 21.2, R2.5).
 *
 * Drží jen UI a stav odeslání přes `useActionState`; veškerá logika i vydání
 * relace běží v server action předané v `action`. Klientská validace je
 * minimální (HTML required) — autoritou validace je Auth_Service (R2.7).
 */
import { useActionState } from "react";
import { LogIn, UserPlus } from "lucide-react";
import type { AuthFormState } from "@/app/auth-actions";

type AuthAction = (
  prev: AuthFormState,
  formData: FormData,
) => Promise<AuthFormState>;

export interface AuthFormProps {
  readonly action: AuthAction;
  readonly mode: "signin" | "signup";
  readonly callbackUrl?: string;
}

const INPUT_CLASS =
  "w-full rounded-[var(--radius-lg)] border border-charcoal bg-[color:var(--color-graphite)] px-3 py-2 text-[length:var(--text-body)] text-chalk-white placeholder:text-ash focus:border-netflix-red focus:outline-none";

export function AuthForm({ action, mode, callbackUrl }: AuthFormProps) {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    action,
    { error: null },
  );
  const isSignup = mode === "signup";

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-5">
      <input type="hidden" name="callbackUrl" value={callbackUrl ?? "/"} />

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="email"
          className="text-[length:var(--text-caption)] font-semibold text-silver"
        >
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className={INPUT_CLASS}
          placeholder="you@email.com"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="password"
          className="text-[length:var(--text-caption)] font-semibold text-silver"
        >
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete={isSignup ? "new-password" : "current-password"}
          required
          minLength={8}
          maxLength={128}
          className={INPUT_CLASS}
          placeholder="8–128 characters"
        />
      </div>

      {state.error ? (
        <p role="alert" className="text-[length:var(--text-caption)] text-netflix-red">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center gap-2 rounded-[var(--radius-lg)] bg-netflix-red px-4 py-2 text-[length:var(--text-body)] font-semibold text-chalk-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? (
          "Processing…"
        ) : isSignup ? (
          <>
            <UserPlus aria-hidden size={16} />
            Create account
          </>
        ) : (
          <>
            <LogIn aria-hidden size={16} />
            Sign in
          </>
        )}
      </button>
    </form>
  );
}
