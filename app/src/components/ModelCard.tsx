import Link from "next/link";

/**
 * ModelCard — karta modelu na stránce Models (R13.1, R13.2).
 *
 * Zobrazuje profilovou fotografii a jméno modelu; chybí-li fotka, vykreslí se
 * zástupný vizuál (placeholder) s iniciálou (R13.2). Celá karta odkazuje na
 * detail modelu (`/models/<id>`), kde je artist page s galerií.
 *
 * Náhled (`photoUrl`) jde výhradně přes proxy Streaming_URL, nikdy přes trvalý
 * odkaz na Drive (R6.4) — drátování v tasku 21.
 */
export interface ModelCardModel {
  readonly id: string;
  readonly name: string;
  /** Profilová fotka přes proxy; `undefined`/prázdné → placeholder (R13.2). */
  readonly photoUrl?: string;
}

export interface ModelCardProps {
  readonly model: ModelCardModel;
}

function initial(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed[0]!.toUpperCase() : "•";
}

export function ModelCard({ model }: ModelCardProps) {
  const hasPhoto = typeof model.photoUrl === "string" && model.photoUrl.trim().length > 0;
  const label = model.name.trim().length > 0 ? model.name : "Bez jména";

  return (
    <Link
      href={`/models/${model.id}`}
      aria-label={label}
      className="group block w-full text-left transition-transform duration-200 ease-out hover:scale-[1.03] focus-visible:scale-[1.03] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-netflix-red)]"
    >
      <div
        className="relative aspect-square w-full overflow-hidden rounded-2xl"
        style={{ background: "var(--gradient-feature-card)" }}
      >
        {hasPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element -- náhled jde přes proxy Streaming_URL, ne přes next/image loader
          <img
            src={model.photoUrl}
            alt={label}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="absolute inset-0 flex items-center justify-center text-[length:var(--text-heading)] font-black text-[color:var(--color-chalk-white)]/30"
          >
            {initial(model.name)}
          </span>
        )}
      </div>
      <p className="mt-2 truncate text-[length:var(--text-body)] font-medium text-[color:var(--color-chalk-white)]">
        {label}
      </p>
    </Link>
  );
}

export default ModelCard;
