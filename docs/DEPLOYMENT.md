# Deployment

Compte is a single Next.js app (modular monolith). Pick a host that runs a long-lived Node process.

## Option 1: single VM / Render / Railway / Fly (SQLite, simplest)

```bash
npm ci
npm run db:generate
DATABASE_URL="file:/data/compte.db" npm run db:migrate     # persistent volume at /data
npm run build
DATABASE_URL="file:/data/compte.db" NODE_ENV=production DEMO_MODE=false npm start
```

- Mount a **persistent volume** for the SQLite file and back it up (e.g. `sqlite3 compte.db ".backup ..."` on a schedule, or Litestream).
- Run **one instance**. The rate limiter is in-memory, and SQLite has a single writer.
- `assets/fonts/` must ship with the app; the PDF renderer reads it from `process.cwd()`.
- Put HTTPS in front (the platform proxy or Caddy). Session cookies are `Secure` in production.

## Option 2: PostgreSQL (multi-instance)

1. In `prisma/schema.prisma`, set `provider = "postgresql"`. Money stays in decimal strings; you can migrate those columns to `Decimal @db.Decimal(18,2)` later.
2. `npm i @prisma/adapter-pg pg` and swap the adapter in `src/server/db.ts`.
3. Generate a fresh baseline with `npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script`, then port `prisma/migrations/*_invoice_immutability` to PL/pgSQL triggers.
4. Use `npx prisma migrate deploy` (the bundled runner is SQLite-only).
5. Replace the in-memory rate limiter (`src/server/rate-limit.ts`) with Redis/Upstash.

## Serverless (Vercel etc.)
`better-sqlite3` and a local SQLite file don't fit serverless. Use Option 2 with a hosted Postgres. Keep `pdfkit`/`fontkit` in `serverExternalPackages` (already configured) and include `assets/fonts` in output tracing (configured for `/api/**`).

## Required production settings

| Variable | Production value |
|---|---|
| `NODE_ENV` | `production` |
| `DEMO_MODE` | `false`. With `true`, logins are refused unless `ALLOW_DEMO_IN_PRODUCTION=true` (only for a public demo built on fictional data) |
| `DATABASE_URL` | persistent SQLite path or Postgres URL |
| `APP_BASE_URL` | your HTTPS origin |
| `ANTHROPIC_API_KEY`, `SARVAM_API_KEY`, `RESEND_API_KEY` + `EMAIL_FROM` | optional; each feature degrades honestly without its key |
| `SMS_WEBHOOK_SECRET` | needed only when a real SMS provider calls `/api/sms/inbound` |

Do **not** seed demo data in production (`npm run db:seed` creates a fictional business and a known password).

## Wiring a real merchant-SMS provider (P2)
Point the provider's inbound webhook at `POST /api/sms/inbound` with JSON `{ messageId, from, body }` and header `X-Compte-Signature: hex(HMAC_SHA256(SMS_WEBHOOK_SECRET, rawBody))`. Messages are idempotent per `messageId`. The sender's number must match exactly one business phone. **Never** route GSTN 14409 traffic through this endpoint: Compte rejects GSTN-looking messages and redacts them.

## Operational checklist
- [ ] HTTPS everywhere; DEMO_MODE=false
- [ ] Daily DB backups, with a restore that has actually been tested
- [ ] Log shipping (the app never logs secrets or message bodies)
- [ ] Review `docs/GST_COMPLIANCE_LIMITATIONS.md` §3 with a chartered accountant
- [ ] Perform and verify one real nil filing with an authorised taxpayer before advertising the feature as live
