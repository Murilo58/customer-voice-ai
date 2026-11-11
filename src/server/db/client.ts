import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Único ponto autorizado a instanciar o PrismaClient (verificado por scripts/check-security.mjs).
// O runtime conecta com o papel app_runtime, sem BYPASSRLS (ADR-002).

export type Db = PrismaClient;

export function createPrismaClient(connectionString: string, driver = process.env.DATABASE_DRIVER ?? "neon"): Db {
  const adapter = driver === "pg" ? new PrismaPg({ connectionString }) : new PrismaNeon({ connectionString });
  return new PrismaClient({ adapter });
}

const globalForDb = globalThis as unknown as { __cvaDb?: Db };

export function getDb(): Db {
  if (!globalForDb.__cvaDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL não definida.");
    globalForDb.__cvaDb = createPrismaClient(url);
  }
  return globalForDb.__cvaDb;
}
