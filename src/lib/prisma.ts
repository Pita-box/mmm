/**
 * Sdílený singleton Prisma klienta.
 *
 * V Next.js dev režimu se moduly při hot-reloadu opakovaně vyhodnocují, což by
 * vedlo k vyčerpání spojení vytvářením nového `PrismaClient` při každém reloadu.
 * Klient se proto cachuje na `globalThis` (mimo produkci).
 */
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
