"use client";

/**
 * PageVisibilityToggles — globální skrytí/zobrazení sekcí webu (task 20.6, R16.1).
 *
 * Pro každou spravovatelnou sekci nabízí přepínač skrytá/viditelná. Skrytá
 * sekce zmizí z navigace i z přístupu (vynucení řeší Access_Middleware, R16.2/16.3).
 * Stav přichází přes props; skutečné uložení (Page_Visibility_Service) doplní
 * task 21.2 — `onToggle` je zatím TODO stub. Sekce zde odpovídají klíčům
 * v `decideAccess` / NAV_ITEMS (`sectionKey`).
 */
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { AdminCard } from "./admin-ui";

/** Spravovatelná sekce a její aktuální stav skrytí. */
export interface SectionVisibility {
  readonly sectionKey: string;
  readonly label: string;
  readonly hidden: boolean;
}

/** Výchozí sada spravovatelných sekcí (mimo kořen Preview a Admin). */
export const MANAGEABLE_SECTIONS: readonly Omit<SectionVisibility, "hidden">[] = [
  { sectionKey: "search", label: "Search" },
  { sectionKey: "models", label: "Models" },
  { sectionKey: "collections", label: "Collections" },
  { sectionKey: "settings", label: "Settings" },
] as const;

export interface PageVisibilityTogglesProps {
  /** Aktuální mapa `sectionKey → hidden`; chybějící klíč = viditelná. */
  readonly hiddenSections?: Readonly<Record<string, boolean>>;
  /** TODO(task 21): napojit na Page_Visibility_Service.setHidden. */
  readonly onToggle?: (
    sectionKey: string,
    hidden: boolean,
  ) => void | Promise<void>;
}

export function PageVisibilityToggles({
  hiddenSections = {},
  onToggle,
}: PageVisibilityTogglesProps) {
  const [state, setState] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      MANAGEABLE_SECTIONS.map((s) => [
        s.sectionKey,
        hiddenSections[s.sectionKey] === true,
      ]),
    ),
  );

  function toggle(sectionKey: string) {
    const nextHidden = !(state[sectionKey] ?? false);
    setState((prev) => ({ ...prev, [sectionKey]: nextHidden }));
    // TODO(task 21): napojit na Page_Visibility_Service.setHidden.
    void onToggle?.(sectionKey, nextHidden);
  }

  return (
    <AdminCard
      title="Viditelnost stránek"
      description="Skryté sekce zmizí z navigace i z přístupu pro všechny uživatele."
    >
      <ul className="flex flex-col divide-y divide-graphite">
        {MANAGEABLE_SECTIONS.map((section) => {
          const hidden = state[section.sectionKey] ?? false;
          const toggleId = `visibility-${section.sectionKey}`;
          return (
            <li
              key={section.sectionKey}
              className="flex items-center justify-between gap-3 py-3"
            >
              <span className="text-[length:var(--text-body)] text-chalk-white">
                {section.label}
              </span>
              <label
                htmlFor={toggleId}
                className="flex cursor-pointer items-center gap-2 text-[length:var(--text-caption)] text-silver"
              >
                {hidden ? (
                  <EyeOff aria-hidden size={16} className="text-[color:var(--color-ash)]" />
                ) : (
                  <Eye aria-hidden size={16} className="text-[color:var(--color-netflix-red)]" />
                )}
                {hidden ? "Skrytá" : "Viditelná"}
                <input
                  id={toggleId}
                  type="checkbox"
                  role="switch"
                  checked={!hidden}
                  onChange={() => toggle(section.sectionKey)}
                  aria-label={`Viditelnost sekce ${section.label}`}
                  className="h-4 w-4 accent-[color:var(--color-netflix-red)]"
                />
              </label>
            </li>
          );
        })}
      </ul>
    </AdminCard>
  );
}
