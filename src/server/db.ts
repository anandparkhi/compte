import "server-only";
import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";

function sqliteUrl(url: string): string {
  if (!url.startsWith("file:")) throw new Error("This build is configured for SQLite (file: URLs). See docs/DEPLOYMENT.md for PostgreSQL.");
  const p = url.slice(5);
  return `file:${path.isAbsolute(p) ? p : path.resolve(process.cwd(), p)}`;
}

function create(url: string) {
  const adapter = new PrismaBetterSqlite3({ url });
  return new PrismaClient({ adapter });
}

// Cache per URL so dev hot-reload reuses the client while tests can point at their own DB file.
const url = sqliteUrl(process.env.DATABASE_URL ?? "file:./prisma/dev.db");
const g = globalThis as unknown as { __comptePrisma?: { url: string; client: ReturnType<typeof create> } };
export const prisma = g.__comptePrisma?.url === url ? g.__comptePrisma.client : create(url);
if (process.env.NODE_ENV !== "production") g.__comptePrisma = { url, client: prisma };

export type Db = typeof prisma;
export type Tx = Parameters<Parameters<Db["$transaction"]>[0]>[0];
