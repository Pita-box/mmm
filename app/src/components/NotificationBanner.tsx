"use client";

/**
 * NotificationBanner — globální oznámení adminem jako toast (R17.1).
 *
 * Zobrazí text aktivního oznámení všem přihlášeným uživatelům jako plovoucí
 * toast v pravém dolním rohu. Banner je singleton (nejvýše jeden aktivní, řeší
 * `Notification_Service`, R17.5) — tato komponenta jen vykreslí předaný text.
 * Je-li `text` prázdný nebo `null`, nevykreslí se nic (R17.2).
 *
 * Toast lze v rámci relace zavřít (dismiss) — lokální UI stav, nemění stav
 * oznámení na serveru. Při novém textu se zobrazí znovu (R17.5).
 *
 * TODO(task 21): `text` napojen na `Notification_Service.getActiveBanner()`
 * přes layout (doručení každé nové relaci, R17.4).
 */
import { useEffect, useState } from "react";
import { Megaphone, X } from "lucide-react";

export interface NotificationBannerProps {
  /** Text aktivního oznámení (1–500 znaků), nebo `null`/prázdný = bez toastu. */
  readonly text?: string | null;
}

export function NotificationBanner({ text }: NotificationBannerProps) {
  const trimmed = (text ?? "").trim();
  const [dismissed, setDismissed] = useState(false);

  // Nový/změněný text → toast se zobrazí znovu (R17.5).
  useEffect(() => {
    setDismissed(false);
  }, [trimmed]);

  if (trimmed.length === 0 || dismissed) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        animation: "toast-in 220ms ease-out",
        borderColor:
          "color-mix(in oklab, var(--color-chalk-white) 15%, transparent)",
        boxShadow: "0 8px 30px rgba(0, 0, 0, 0.5)",
      }}
      className="fixed bottom-6 right-6 z-50 flex max-w-[calc(100vw-3rem)] items-start gap-3 rounded-2xl border bg-[color:var(--color-deep-space)]/60 px-6 py-3 text-[length:var(--text-body)] text-[color:var(--color-chalk-white)] backdrop-blur-md sm:max-w-sm"
    >
      <Megaphone
        aria-hidden
        size={18}
        className="mt-0.5 shrink-0 text-[color:var(--color-netflix-red)]"
      />
      <p className="flex-1 font-medium leading-snug">{trimmed}</p>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Zavřít oznámení"
        className="-mr-1 -mt-1 shrink-0 cursor-pointer rounded-[var(--radius-sm)] p-1 leading-none text-[color:var(--color-silver)] transition-colors hover:text-[color:var(--color-chalk-white)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-chalk-white)]"
      >
        <X aria-hidden size={16} />
      </button>
    </div>
  );
}

export default NotificationBanner;
