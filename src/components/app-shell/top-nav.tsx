"use client";

/**
 * TopNav — full-width header aplikace (nahrazuje levý aside).
 *
 * Tři sloupce: vlevo logo, uprostřed hlavní navigace, vpravo profil + odhlášení.
 * Sticky nahoře; pozadí je **eliptický gradient** — tmavý uprostřed, k okrajům
 * doleva a doprava výrazně splývá s černým pozadím body (větší fade po stranách).
 *
 * Klientská komponenta: aktivní položka se odvozuje z `usePathname`; navigace se
 * filtruje dle role + skrytých sekcí přes čistou `buildNavItems` (Lucide ikony
 * jsou funkce → musí zůstat na klientu, nesmí přes hranici Server→Client).
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, CircleUserRound } from "lucide-react";
import type { Role } from "@/lib/domain";
import { buildNavItems, isNavItemActive } from "./nav-items";
import { signOutAction } from "@/app/auth-actions";

/**
 * Eliptický gradient pozadí headeru: tmavý nahoře uprostřed, hladce dojíždí
 * „doztracena" — vícestupňový plynulý fade na úplnou průhlednost. Vodorovný
 * poloměr 50 % → levý/pravý okraj splývá s body úplně (velký fade po stranách);
 * svislý 100 % → dojede do nuly přesně na spodní hraně gradientové vrstvy.
 *
 * Gradient žije ve VLASTNÍ vrstvě (`HEADER_FADE_HEIGHT`), která přesahuje pod
 * obsah headeru — má tak dost vertikálního prostoru na hladký dojezd, aniž by
 * posouvala obsah nebo blokovala kliky (`pointer-events-none`).
 */
const HEADER_GRADIENT =
  "radial-gradient(ellipse 50% 100% at 50% 0%," +
  " rgba(0,0,0,0.92) 0%," +
  " rgba(0,0,0,0.85) 16%," +
  " rgba(0,0,0,0.66) 34%," +
  " rgba(0,0,0,0.44) 52%," +
  " rgba(0,0,0,0.24) 68%," +
  " rgba(0,0,0,0.1) 82%," +
  " rgba(0,0,0,0.03) 92%," +
  " rgba(0,0,0,0) 100%)";

/** Výška gradientové vrstvy — výrazně přesahuje obsah headeru kvůli dojezdu. */
const HEADER_FADE_HEIGHT = "240px";

/**
 * Rohové vrstvy (vlevo/vpravo) — jemný blur + tmavý fade pro čitelnost loga
 * (vlevo) a profilu/„Odhlásit se" (vpravo), kde centrální gradient už splývá.
 * `maskImage` nechá blur i tmu plynule zmizet do středu/dolů (žádný šev).
 */
const CORNER_FADE_HEIGHT = "200px";
const CORNER_FADE_LEFT =
  "radial-gradient(ellipse 85% 85% at 0% 0%," +
  " rgba(0,0,0,0.9) 0%," +
  " rgba(0,0,0,0.6) 28%," +
  " rgba(0,0,0,0.3) 50%," +
  " rgba(0,0,0,0.1) 70%," +
  " rgba(0,0,0,0) 85%)";
const CORNER_FADE_RIGHT =
  "radial-gradient(ellipse 85% 85% at 100% 0%," +
  " rgba(0,0,0,0.9) 0%," +
  " rgba(0,0,0,0.6) 28%," +
  " rgba(0,0,0,0.3) 50%," +
  " rgba(0,0,0,0.1) 70%," +
  " rgba(0,0,0,0) 85%)";
const CORNER_MASK_LEFT =
  "radial-gradient(ellipse 85% 85% at 0% 0%, #000 0%, #000 38%, rgba(0,0,0,0) 85%)";
const CORNER_MASK_RIGHT =
  "radial-gradient(ellipse 85% 85% at 100% 0%, #000 0%, #000 38%, rgba(0,0,0,0) 85%)";

export interface TopNavProps {
  /** Role přihlášeného uživatele (řídí položku Admin, R3.4). */
  readonly role: Role;
  /** Mapa `sekce → skrytá` z Page_Visibility (R16.1, R16.2). */
  readonly hiddenSections?: Readonly<Record<string, boolean>>;
  /** Zobrazované jméno přihlášeného uživatele. */
  readonly displayName?: string | null;
}

export function TopNav({ role, hiddenSections = {}, displayName }: TopNavProps) {
  const pathname = usePathname() ?? "/";
  const items = buildNavItems({ role, hiddenSections });

  return (
    <header className="sticky top-0 z-40 w-full">
      {/* Gradientová vrstva přesahující pod obsah headeru → dlouhý hladký dojezd. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0"
        style={{ height: HEADER_FADE_HEIGHT, background: HEADER_GRADIENT }}
      />

      {/* Rohové blur + fade vrstvy pro čitelnost loga a pravých ovládacích prvků. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 backdrop-blur-[2px]"
        style={{
          width: "38%",
          height: CORNER_FADE_HEIGHT,
          background: CORNER_FADE_LEFT,
          maskImage: CORNER_MASK_LEFT,
          WebkitMaskImage: CORNER_MASK_LEFT,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute right-0 top-0 backdrop-blur-[2px]"
        style={{
          width: "38%",
          height: CORNER_FADE_HEIGHT,
          background: CORNER_FADE_RIGHT,
          maskImage: CORNER_MASK_RIGHT,
          WebkitMaskImage: CORNER_MASK_RIGHT,
        }}
      />

      <div className="relative z-10 grid grid-cols-3 items-center gap-4 px-6 py-4">
        {/* Vlevo: logo (jediný silný akcent). */}
        <div className="flex items-center">
          <Link
            href="/"
            className="text-[length:var(--text-heading-sm)] font-black tracking-tight text-netflix-red"
          >
            MMMRED
          </Link>
        </div>

        {/* Uprostřed: hlavní navigace. */}
        <nav
          aria-label="Main navigation"
          className="flex items-center justify-center"
        >
          <ul className="flex items-center gap-1">
            {items.map((item) => {
              const active = isNavItemActive(item, pathname);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={[
                      "relative flex items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-[length:var(--text-body)] transition-colors",
                      active
                        ? "font-bold text-chalk-white"
                        : "font-medium text-silver hover:text-chalk-white",
                    ].join(" ")}
                  >
                    <Icon aria-hidden size={18} strokeWidth={active ? 2.5 : 2} />
                    <span className="hidden sm:inline">{item.label}</span>
                    {/* Aktivní indikátor: červený spodní pruh. */}
                    {active && (
                      <span
                        aria-hidden
                        className="absolute inset-x-2 -bottom-0.5 h-0.5 rounded-full bg-netflix-red"
                      />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Vpravo: profil (odkaz na Settings) + odhlášení. */}
        <div className="flex items-center justify-end gap-3">
          <Link
            href="/settings"
            aria-label="Profile settings"
            title={displayName ?? "Settings"}
            className="flex items-center gap-2 text-silver transition-colors hover:text-chalk-white focus-visible:text-chalk-white focus-visible:outline-none"
          >
            <CircleUserRound aria-hidden size={24} />
            {displayName && (
              <span className="hidden text-[length:var(--text-caption)] md:inline">
                {displayName}
              </span>
            )}
          </Link>
          <form action={signOutAction}>
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-[var(--radius-lg)] border border-charcoal px-3 py-1.5 text-[length:var(--text-caption)] font-semibold text-silver transition-colors hover:border-netflix-red hover:text-chalk-white"
            >
              <LogOut aria-hidden size={14} />
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
