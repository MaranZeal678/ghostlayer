import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** DATABASE_URL locally; on Vercel the Supabase integration provides POSTGRES_URL (transaction pooler). */
export function databaseUrl() {
  return process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL || "";
}

function makeClient() {
  const raw = databaseUrl();
  const url = new URL(raw);
  const managed = /supabase|neon|pooler/.test(url.hostname);
  // Managed Postgres terminates TLS with a provider CA; node-postgres treats sslmode=require as full verification.
  if (managed) url.searchParams.delete("sslmode");
  const adapter = new PrismaPg({
    connectionString: url.toString(),
    ...(managed ? { ssl: { rejectUnauthorized: false } } : {}),
    max: process.env.VERCEL ? 3 : 10,
  });
  return new PrismaClient({ adapter });
}

export const db = globalForPrisma.prisma ?? makeClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
