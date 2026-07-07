/**
 * Globální 404 template (Netflix-style). Renderuje se pro neexistující cesty
 * i pro `notFound()` ze skrytých sekcí (nedostupné pro ne-Adminy). Centrovaný
 * obsah: značka, sdělení a tlačítko na Telegram.
 */
import { Send } from "lucide-react";

export default function NotFound() {
  const telegram = process.env.NEXT_PUBLIC_TELEGRAM_GROUP_URL;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[color:var(--color-deep-space)] px-6 text-center">
      <h1 className="text-[length:var(--text-heading)] font-black tracking-tight text-[color:var(--color-netflix-red)]">
        MMMRED
      </h1>
      <p className="max-w-md text-[length:var(--text-body)] text-[color:var(--color-silver)]">
        This page does not exist or locked for you. Contact me via Telegram for more.
      </p>
      {telegram ? (
        <a
          href={telegram}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-[var(--radius-pills)] bg-[color:var(--color-netflix-red)] px-6 py-3 text-[length:var(--text-body)] font-bold text-[color:var(--color-chalk-white)] transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-chalk-white)]"
        >
          <Send aria-hidden size={18} />
          Telegram
        </a>
      ) : null}
    </main>
  );
}
