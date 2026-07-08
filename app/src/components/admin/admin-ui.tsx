/**
 * Sdílené UI primitivy pro Admin_Console (task 20.6).
 *
 * Malá, bezstavová sada vstupů a kontejnerů sladěná s Netflix-style tokeny
 * (`--color-deep-space`, akcent `--color-netflix-red`). Drží konzistentní
 * vzhled administrátorských formulářů bez zavádění UI knihovny.
 *
 * Komponenty jsou prezentační (žádné I/O); validaci a stav řídí konkrétní
 * formuláře. Skutečné odeslání (server actions / route handlery) doplní
 * task 21.2 — formuláře sem zatím předávají TODO(task 21) handlery.
 */
import type { ReactNode } from "react";

/** Karta sekce administrátorského rozhraní s nadpisem a popisem. */
export function AdminCard({
  title,
  description,
  children,
}: {
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="rounded-[var(--radius-2xl)] border border-graphite bg-[color:var(--color-deep-space)] p-6">
      <header className="mb-5">
        <h2 className="text-[length:var(--text-subheading)] font-bold text-chalk-white">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-[length:var(--text-caption)] text-silver">
            {description}
          </p>
        ) : null}
      </header>
      {children}
    </section>
  );
}

/** Obal pole formuláře: popisek, obsah a volitelná chybová hláška. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  readonly label: string;
  readonly htmlFor: string;
  readonly hint?: string;
  readonly error?: string | null;
  readonly children: ReactNode;
}) {
  const errorId = error ? `${htmlFor}-error` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={htmlFor}
        className="text-[length:var(--text-caption)] font-semibold text-silver"
      >
        {label}
      </label>
      {children}
      {hint && !error ? (
        <p className="text-[length:var(--text-caption)] text-ash">{hint}</p>
      ) : null}
      {error ? (
        <p
          id={errorId}
          role="alert"
          className="text-[length:var(--text-caption)] text-netflix-red"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

const FIELD_CLASS =
  "w-full rounded-[var(--radius-lg)] border border-charcoal bg-[color:var(--color-graphite)] px-3 py-2 text-[length:var(--text-body)] text-chalk-white placeholder:text-ash focus:border-netflix-red focus:outline-none";

/** Jednořádkový textový vstup sladěný s tokeny. */
export function TextInput(
  props: React.InputHTMLAttributes<HTMLInputElement>,
) {
  return <input {...props} className={FIELD_CLASS} />;
}

/** Víceřádkový textový vstup sladěný s tokeny. */
export function TextArea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>,
) {
  return <textarea {...props} className={`${FIELD_CLASS} min-h-24 resize-y`} />;
}

/** Primární / sekundární tlačítko. */
export function Button({
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly variant?: "primary" | "secondary" | "danger";
}) {
  const styles: Record<string, string> = {
    primary: "bg-netflix-red text-chalk-white hover:opacity-90",
    secondary:
      "border border-charcoal bg-transparent text-chalk-white hover:bg-graphite",
    danger:
      "border border-netflix-red bg-transparent text-netflix-red hover:bg-netflix-red hover:text-chalk-white",
  };
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-[var(--radius-lg)] px-6 py-2 text-[length:var(--text-body)] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}
    />
  );
}

/** Malý štítek stavu/role. */
export function Badge({
  tone = "neutral",
  children,
}: {
  readonly tone?: "neutral" | "positive" | "negative" | "accent";
  readonly children: ReactNode;
}) {
  const tones: Record<string, string> = {
    neutral: "bg-charcoal text-chalk-white",
    positive: "bg-[color:var(--color-graphite)] text-chalk-white",
    negative: "bg-netflix-red text-chalk-white",
    accent: "border border-netflix-red text-netflix-red",
  };
  return (
    <span
      className={`inline-flex items-center rounded-[var(--radius-sm)] px-2 py-0.5 text-[length:var(--text-caption)] font-semibold leading-none ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/** Nenápadné upozornění, že drátování odeslání doplní task 21. */
export function WiringNotice() {
  return (
    <p className="mt-4 text-[length:var(--text-caption)] text-ash">
      Submission will be wired to the server in task 21 (server actions / route handlers).
    </p>
  );
}
