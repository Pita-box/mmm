/**
 * Sign In — veřejná přihlašovací stránka (R2.3, R2.5).
 *
 * Veřejná cesta (PUBLIC_PATHS); middleware ji nechá projít. Po úspěšném
 * přihlášení server action vydá session cookie a přesměruje na `callbackUrl`
 * (zachování cíle pro návrat, R21.4).
 */
import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
import { signInAction } from "@/app/auth-actions";

export default async function SignInPage({
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
          Přihlaste se ke svému účtu.
        </p>
      </header>

      <AuthForm action={signInAction} mode="signin" callbackUrl={callbackUrl} />

      <p className="text-[length:var(--text-caption)] text-silver">
        Nemáte účet?{" "}
        <Link href="/signup" className="font-semibold text-netflix-red hover:underline">
          Zaregistrujte se
        </Link>
      </p>
    </main>
  );
}
