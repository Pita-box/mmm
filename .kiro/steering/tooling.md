# Nástroje a package manager (MMM-app)

Závazné konvence pro nástrojový řetězec aplikace. Platí pro veškerou práci v `app/`.

## Package manager: pnpm

- **Vždy používej `pnpm`**, nikdy `npm` ani `yarn` (důvod: optimalizace úložiště — sdílený obsahově adresovaný store).
- Kanonický lockfile je `app/pnpm-lock.yaml`. Pokud vznikne `package-lock.json` nebo `yarn.lock`, smaž ho.
- Příkazy:
  - instalace: `pnpm install`
  - přidání závislosti: `pnpm add <pkg>` / `pnpm add -D <pkg>`
  - skripty: `pnpm <script>` (např. `pnpm test`, `pnpm build`, `pnpm dev`)
  - jednorázové binárky: `pnpm dlx <pkg>` (místo `npx`)
  - Prisma: `pnpm exec prisma <cmd>` nebo `pnpm prisma <cmd>`
- Skript `test` běží v jednorázovém režimu (`vitest --run`).

## Poznámka k Next.js workspace root

Na disku existují cizí lockfile výš ve stromu (`~/pnpm-lock.yaml`), které by Next.js jinak chybně zvolil jako workspace root. Proto je v `app/next.config.ts` napevno nastaven `outputFileTracingRoot` na složku `app/`. Nech ho tam.
