/**
 * Paywall — veřejná informační stránka o nutnosti předplatného. [POST-MVP]
 *
 * V MVP režimu (`PAYMENTS_ENABLED=false`) na ni middleware nikdy nepřesměruje;
 * existuje jako veřejná cesta pro post-MVP režim (R20.6, R21.2).
 */
import Link from "next/link";
import { Lock } from "lucide-react";
import { TrackEventOnMount } from "@/components/TrackEventOnMount";

export default function PaywallPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-deep-space px-6 text-center text-chalk-white">
      <TrackEventOnMount event="paywall_view" />
      <Lock aria-hidden size={48} className="text-netflix-red" />
      <h1 className="text-[length:var(--text-heading)] font-black text-netflix-red">
        Předplatné
      </h1>
      <p className="max-w-md text-[length:var(--text-body)] text-silver">
        Pro přístup k obsahu je potřeba aktivní předplatné. Tato funkce se
        aktivuje po dokončení MVP.
      </p>
      <Link
        href="/signin"
        className="rounded-[var(--radius-lg)] bg-netflix-red px-4 py-2 font-semibold text-chalk-white hover:opacity-90"
      >
        Zpět na přihlášení
      </Link>
    </main>
  );
}
