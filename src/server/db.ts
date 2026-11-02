import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

function create() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL must be configured for PostgreSQL");
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

const g = globalThis as unknown as { __comptePrisma?: ReturnType<typeof create> };
export const prisma = g.__comptePrisma ?? create();
if (process.env.NODE_ENV !== "production") g.__comptePrisma = prisma;

export type Db = typeof prisma;
export type Tx = Parameters<Parameters<Db["$transaction"]>[0]>[0];
