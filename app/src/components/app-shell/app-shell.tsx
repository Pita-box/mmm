/**
 * AppShell — kostra přihlášené aplikace (task 20.1).
 *
 * Full-width layout: nahoře `TopNav` (header s logem, navigací a profilem),
 * pod ním obsah stránky přes celou šířku. Levý aside byl zrušen — navigace je
 * v headeru. AppShell je určen výhradně pro přihlášené uživatele (vynucení
 * autentizace řeší middleware, task 21); tato komponenta jen předá data.
 *
 * Server komponenta: filtrace navigace běží v klientském `TopNav` (Lucide ikony
 * jsou funkce a nesmí přejít přes hranici Server→Client) — předáváme jen plain
 * data (`role`, `hiddenSections`, `displayName`).
 *
 * _Requirements: 3.4, 16.1, 16.2_
 */
import type { ReactNode } from "react";
import type { Role } from "@/lib/domain";
import { TopNav } from "./top-nav";

export interface AppShellProps {
  /** Role přihlášeného uživatele; řídí zobrazení administrátorské položky (R3.4). */
  readonly role: Role;
  /**
   * Mapa `sekce → skrytá` z Page_Visibility. Skryté sekce se v navigaci
   * nezobrazí (R16.1, R16.2). Výchozí prázdná mapa = nic není skryto.
   */
  readonly hiddenSections?: Readonly<Record<string, boolean>>;
  /** Zobrazované jméno uživatele pro profil v headeru. */
  readonly displayName?: string | null;
  /** Obsah aktuální stránky. */
  readonly children: ReactNode;
}

export function AppShell({
  role,
  hiddenSections = {},
  displayName,
  children,
}: AppShellProps) {
  return (
    <div className="min-h-screen bg-deep-space text-chalk-white">
      <TopNav
        role={role}
        hiddenSections={hiddenSections}
        displayName={displayName}
      />
      <main className="mx-auto w-full max-w-[1280px] px-3 pb-28 pt-4 md:px-6 md:py-8 md:pt-24">
        {children}
      </main>
    </div>
  );
}
