# Vercel + PostgreSQL deployment

Compte uses PostgreSQL with Prisma 7 on Vercel. SQLite is no longer the default datasource on this branch.

1. Add `DATABASE_URL` in Vercel environment variables from the attached Postgres provider.
2. Optionally set `DIRECT_URL` to the database provider's direct (non-pooler) URL for migrations.
3. Install dependencies with `npm install`; this branch intentionally drops the stale SQLite npm lockfile. **Commit a freshly generated package-lock.json before using npm ci.**
4. Execute `npx prisma migrate deploy` once against the **empty** PostgreSQL database using a direct connection.
5. Deploy with `npm run build` (runs `prisma generate && next build`), and `npm run start` is not required in Vercel.
6. Set `APP_BASE_URL`, `DEMO_MODE=false`, and optional integration keys in Vercel. Never seed demo data in production.

The PostgreSQL initial migration recreates the schema and database-level immutability triggers protecting issued invoices. Existing SQLite data is **not copied**; migrate it separately if necessary. Do not run the old SQLite migration runner against PostgreSQL.

## Operational cautions

- The rate limiter is still in-memory and unsuitable for consistent enforcement across serverless instances; move it to shared storage before handling production users.
- Keep database backups and verify restore procedures.
- Verify the invoice immutability triggers and database privileges on a staging database before entering real financial records.
- The PDF asset-tracing settings still need an end-to-end deployment smoke test.
