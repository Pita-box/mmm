/**
 * AppShell navigace — čisté jádro (task 20.1).
 *
 * Definuje kanonickou sadu navigačních položek a čisté funkce pro jejich
 * filtrování a zvýraznění aktivní položky. Logika je oddělena od React
 * komponent, aby byla přímo testovatelná (UI testy v tasku 20.7) bez DOM.
 *
 * Pravidla viditelnosti:
 *  - Položka `Admin` se zobrazí pouze uživateli s rolí `Admin` (R3.4).
 *  - Sekce globálně skrytá v Page_Visibility se v navigaci nezobrazí
 *    (R16.1, R16.2). Klíč sekce odpovídá prvnímu segmentu cesty — stejná
 *    konvence jako v `decideAccess` (`@/lib/access`).
 *
 * Položka Preview (`/`) nemá klíč sekce (kořen) a nepodléhá skrývání.
 */
import type { Role } from "@/lib/domain";
import {
  Clapperboard,
  Search,
  Users,
  Bookmark,
  Shield,
  UploadCloud,
  type LucideIcon,
} from "lucide-react";

/** Jedna položka navigace. */
export interface NavItem {
  /** Viditelný název v navigaci. */
  readonly label: string;
  /** Cílová cesta. */
  readonly href: string;
  /** Ikona položky (Lucide). */
  readonly icon: LucideIcon;
  /**
   * Klíč sekce pro Page_Visibility (první segment cesty), nebo `null` pro
   * kořen (Preview), který se nikdy neskrývá.
   */
  readonly sectionKey: string | null;
  /** Položka dostupná pouze roli Admin (R3.4). */
  readonly adminOnly?: boolean;
}

/**
 * Kanonická sada položek navigace v pořadí zobrazení. Klíče sekcí odpovídají
 * prvnímu segmentu cesty, jak je vyhodnocuje `decideAccess`.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { label: "Preview", href: "/", icon: Clapperboard, sectionKey: null },
  { label: "Search", href: "/search", icon: Search, sectionKey: "search" },
  { label: "Models", href: "/models", icon: Users, sectionKey: "models" },
  { label: "Collections", href: "/collections", icon: Bookmark, sectionKey: "collections" },
  { label: "Nahrát", href: "/upload", icon: UploadCloud, sectionKey: null, adminOnly: true },
  { label: "Admin", href: "/admin", icon: Shield, sectionKey: "admin", adminOnly: true },
] as const;

/** Vstup pro sestavení viditelné navigace. */
export interface BuildNavItemsInput {
  /** Role přihlášeného uživatele (AppShell je jen pro přihlášené). */
  readonly role: Role;
  /** Mapa `sekce → skrytá` z Page_Visibility (R16.1, R16.2). */
  readonly hiddenSections: Readonly<Record<string, boolean>>;
}

/**
 * Sestaví seznam navigačních položek viditelných pro daného uživatele:
 * odfiltruje administrátorské položky pro ne-Adminy (R3.4) a globálně skryté
 * sekce (R16.1, R16.2). Zachovává kanonické pořadí `NAV_ITEMS`.
 */
export function buildNavItems({
  role,
  hiddenSections,
}: BuildNavItemsInput): NavItem[] {
  return NAV_ITEMS.filter((item) => {
    // Admin položka: pro Admina i Distributora (jen User ji nevidí, R3.4 + feature distributor).
    if (item.adminOnly && role === "User") return false;
    if (item.sectionKey !== null && hiddenSections[item.sectionKey] === true) {
      return false;
    }
    return true;
  });
}

/**
 * Je daná položka aktivní vzhledem k aktuální cestě? Kořen (`/`) je aktivní
 * pouze pro přesnou shodu; ostatní položky i pro vnořené cesty
 * (např. `/models/123` aktivuje položku Models).
 */
export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.href === "/") return pathname === "/";
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/**
 * Iniciála pro avatar z zobrazovaného jména; prázdné/chybějící jméno vrací
 * neutrální zástupný znak.
 */
export function avatarInitial(displayName: string | null | undefined): string {
  const trimmed = (displayName ?? "").trim();
  return trimmed.length > 0 ? trimmed[0]!.toUpperCase() : "•";
}
