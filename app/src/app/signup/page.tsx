/**
 * Sign Up — veřejná registrační stránka (R2.1, R2.2, R2.7).
 *
 * Veřejná cesta (PUBLIC_PATHS). Po úspěšné registraci server action založí účet
 * (role User, neaktivní předplatné), přihlásí uživatele a přesměruje dál.
 */
import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
import { signUpAction } from "@/app/auth-actions";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-deep-space px-6 text-chalk-white">
      <header className="text-center">
        <h1 className="text-[length:var(--text-heading)] font-black text-netflix-red">
          MMMRED
        </h1>
        <p className="mt-2 text-[length:var(--text-body)] text-silver">
          Vytvořte si účet a získejte přístup k obsahu.
        </p>
      </header>

      <AuthForm action={signUpAction} mode="signup" callbackUrl={callbackUrl} />

      <p className="text-[length:var(--text-caption)] text-silver">
        Už máte účet?{" "}
        <Link href="/signin" className="font-semibold text-netflix-red hover:underline">
          Přihlaste se
        </Link>
      </p>
    </main>
  );
}
