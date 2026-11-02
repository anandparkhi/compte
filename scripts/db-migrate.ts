/**
 * Applies prisma/migrations/* in order to the SQLite database at DATABASE_URL and records
 * them in Prisma's own `_prisma_migrations` table (same columns + sha256 checksum), so a
 * later `prisma migrate deploy` on a machine with Prisma engines sees them as applied.
 *
 * Why this exists: Prisma 7's client is engine-free, but the migration engine is a native
 * binary downloaded at runtime. This runner keeps local setup working offline.
 *
 * Usage: tsx scripts/db-migrate.ts [--reset]
 */
import Database from "better-sqlite3";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

export function resolveSqlitePath(url: string): string {
  if (!url.startsWith("file:")) throw new Error(`Only SQLite file: URLs are supported by this runner (got ${url}). Use \`prisma migrate deploy\` for PostgreSQL.`);
  const p = url.slice("file:".length);
  return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
}

export function migrate(dbPath: string, { reset = false, quiet = false } = {}) {
  if (reset) for (const suffix of ["", "-journal", "-wal", "-shm"]) if (existsSync(dbPath + suffix)) rmSync(dbPath + suffix);
  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");
  db.exec(`CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "checksum" TEXT NOT NULL,
    "finished_at" DATETIME,
    "migration_name" TEXT NOT NULL,
    "logs" TEXT,
    "rolled_back_at" DATETIME,
    "started_at" DATETIME NOT NULL DEFAULT current_timestamp,
    "applied_steps_count" INTEGER UNSIGNED NOT NULL DEFAULT 0
  );`);
  const dir = path.resolve(process.cwd(), "prisma/migrations");
  const names = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  const applied = new Set((db.prepare(`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`).all() as { migration_name: string }[]).map((r) => r.migration_name));
  let count = 0;
  for (const name of names) {
    if (applied.has(name)) continue;
    const sql = readFileSync(path.join(dir, name, "migration.sql"), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const now = new Date().toISOString();
    db.transaction(() => {
      db.exec(sql);
      db.prepare(`INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, started_at, applied_steps_count) VALUES (?, ?, ?, ?, ?, 1)`).run(randomUUID(), checksum, now, name, now);
    })();
    count++;
    if (!quiet) console.log(`applied ${name}`);
  }
  db.close();
  if (!quiet) console.log(count ? `${count} migration(s) applied to ${dbPath}` : `database up to date (${dbPath})`);
}

const isMain = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (isMain) {
  const url = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
  migrate(resolveSqlitePath(url), { reset: process.argv.includes("--reset") });
}
