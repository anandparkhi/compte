# Compte — conversational bookkeeping & GST compliance for Indian small businesses

> **Every transaction, accounted for.** Speak or type a sale in English, Hindi, Marathi or a mix, then review and confirm. Compte issues the GST invoice, updates the books and prepares the return data. For periods with no business, it guides you through filing a **nil GSTR-1 / GSTR-3B through GSTN's official SMS channel (14409)**. You send the SMS yourself; Compte never files anything on your behalf.

This is a working MVP (Next.js modular monolith). It is not a mockup: every screen reads and writes the database, and the flows below are covered by automated tests.

---

## Quick start

```bash
npm install
cp .env.example .env          # works as-is: no paid keys needed
npm run setup                 # prisma generate + migrate + seed fictional demo data
npm run dev                   # http://localhost:3000
```

Demo login (shown on the login page in DEMO_MODE): `demo@compte.example` / `compte-demo-2026`

Requirements: Node 20+ (tested on Node 22). SQLite through `better-sqlite3`, which ships prebuilt binaries.

> **Prisma note.** The Prisma 7 client is engine-free. Prisma's *migration* engine is a native binary that `prisma` downloads on first use. `npm run db:migrate` uses a small bundled runner (`scripts/db-migrate.ts`), so setup works offline. The runner writes Prisma's own `_prisma_migrations` table, so `npx prisma migrate deploy` stays compatible. If `prisma generate` can't download its engine in a locked-down network, run it with `PRISMA_SCHEMA_ENGINE_BINARY=/bin/true`. `generate` doesn't use that engine.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js dev server / production build / production server |
| `npm run db:migrate` | Apply migrations to `DATABASE_URL` |
| `npm run db:reset` | Recreate the DB and reseed the demo business |
| `npm test` | Vitest: 81 unit/integration tests, each test file on a fresh DB |
| `npm run test:e2e` | Playwright: builds nothing itself. Run `npm run build` first; it starts a production server on a fresh seeded DB (port 3100) |
| `npm run typecheck` | `tsc --noEmit` |

---

## What works — honestly

| Capability | Status |
|---|---|
| Onboarding wizard, GSTIN format + check-digit validation | **Working locally**. GSTIN *registration* is **not** live-verified (no authorised data source). |
| Customers & products CRUD (aliases/transliterations, HSN/SAC, rates) | **Working locally**. Rates/HSN only come from your confirmed product settings. |
| Text invoice creation (EN / HI / MR / Hinglish / SMS grammar) | **Working locally** with deterministic offline rules. **Claude extraction** is used when `ANTHROPIC_API_KEY` is set; tested with mock fixtures only. It falls back to rules on any failure. |
| Voice notes | Recording + upload pipeline **working**. Sarvam STT adapter is implemented against current docs but **not tested with live credentials**. Without a key, the app says "Transcription not configured" and text input still works. |
| Deterministic GST engine (exact decimals, CGST/SGST/UTGST/IGST, inclusive/exclusive) | **Working locally**, unit-tested |
| Review → explicit confirmation → issue (idempotent, immutable, Rule 46(b) numbering) | **Working locally**. Immutability enforced in the service layer *and* by SQLite triggers. |
| Server-side PDF invoices (Unicode incl. Devanagari) | **Working locally** |
| Email invoices (Resend) | Adapter implemented; **not tested with live credentials**. Without keys, attempts are recorded as `NOT_SENT_PROVIDER_NOT_CONFIGURED` and never claimed as delivered. |
| Sales ledger & dashboard | **Working locally**: all figures come from the DB |
| GSTR-1 preparation (B2B / B2CL / B2CS / HSN / documents) | **Working locally** |
| GSTR-1 JSON export | **Internal draft only**: labelled `COMPTE_INTERNAL_DRAFT`, `portalUploadReady:false`. **Not validated** against the official GSTN schema. |
| Nil GSTR-1 & nil GSTR-3B: eligibility, official SMS, handoff, ARN recording | **Working locally**. Real filing happens on *your* phone via GSTN. **No live end-to-end filing has been performed or verified.** |
| Nil filing simulator | **Simulated**, labelled "DEMO — NOT GOVERNMENT FILED" everywhere. Codes and ARNs are generated in the browser and never sent to the server. |
| Merchant → Compte SMS | **Simulated** in-app. Signed webhook endpoint exists (`/api/sms/inbound`); **no telecom provider connected**. |
| Filing verification (FILED_VERIFIED) | **Not implemented by design**: needs an authorised GSTN/GSP integration. User-entered ARNs stay `UNVERIFIED`. |
| e-invoicing (IRN), credit/debit notes, purchases/ITC, full GSTR-3B, CA dashboard | **Not implemented** (P2). e-invoicing businesses are blocked from issuing. |
| Hindi & Marathi UI | Major workflows translated (navigation, invoice creation/confirmation, nil-filing eligibility, SMS instructions, statuses). Tax terms are kept in English on purpose. |

See **[docs/GST_COMPLIANCE_LIMITATIONS.md](docs/GST_COMPLIANCE_LIMITATIONS.md)** for everything that must be verified before live use.

---

## The two demos

### Demo A — voice-first bookkeeping
1. Log in, then tap **Create invoice**.
2. Speak (if Sarvam is configured) or tap **मराठी example** / **हिंदी example**, then **Prepare draft**.
3. The review screen shows what was understood (customer *Ramesh Traders*, 20 × Plastic Storage Box @ ₹500, GST 18% extra). It computes **₹10,000 + CGST ₹900 + SGST ₹900 = ₹11,800** and asks you to confirm the place of supply.
4. Tick **I confirm the place of supply**, then **Confirm & issue**. The invoice gets a number (e.g. `DMT/26-27/0011`) and a real PDF.
5. Open **Books & returns → return preparation**: the invoice appears in that month's GSTR-1 preparation.
6. Alternative: **SMS simulator** tab → `BILL RAMESH 20 BOX 500 GST18` → reply `CONFIRM D…`.

### Demo B — nil GST return
1. **GST Returns → September 2026 → File nil return**. GSTR-1 and GSTR-3B are separate cards.
2. **Run demo simulation** (the demo GSTIN is fictional). Answer the eligibility questions; each one is tagged *Compte books*, *Your answer* or *Portal — Compte can't verify*. Then accept the declaration.
3. Acknowledge that a filing is irreversible and that you send the SMS yourself. Compte then shows `NIL R1 27ZZZFZ0001Z1ZU 092026` → **14409**, with **Copy SMS**, **Open SMS app** (`sms:` URI) and basic-phone instructions.
4. Simulated GSTN replies with a code (shown only in the simulated phone). Confirmation format: `CNF R1 <6-digit code>`.
5. Record the ARN. The status becomes **"ARN recorded — not verified"** and never "filed", and you can download the filing activity report (an internal record, not a government certificate).
6. Try **August 2026** (sales exist → nil GSTR-1 blocked) and **May 2026** (purchases exist → nil GSTR-3B blocked while GSTR-1 is still possible).

### Doing a *real* nil filing
Onboard your real business (real GSTIN), declare that your phone is the authorised signatory's registered mobile, and use **Review eligibility** (not the demo). Send the SMS from that phone, reply with `CNF`, then record the ARN GSTN sends you. Check the status on gst.gov.in → *Services › Returns › Track Return Status*. Until an authorised integration exists, Compte will show the ARN as unverified.

---

## Architecture

Modular monolith on **Next.js 15 (App Router) + TypeScript + Tailwind 4**. **Prisma 7** (driver adapter, SQLite locally; PostgreSQL-compatible schema). **Zod** for validation, **decimal.js** for money, **pdfkit** for PDFs, **Anthropic SDK** for extraction, **Vitest + Playwright** for tests.

```
src/lib/domain/        pure, tested business rules (no I/O)
  gstin.ts             format + check digit
  gst.ts               deterministic GST engine (exact decimals)
  invoice-rules.ts     draft validation/computation (shared by preview & issuance)
  invoice-number.ts    Rule 46(b) numbering
  periods.ts           FY / monthly / quarterly periods (IST dates)
  nil-eligibility.ts   GSTR-1 & GSTR-3B nil rules + trilingual questions
  gstn-sms.ts          official 14409 command builder, sms: URIs
  filing-state.ts      evidence-based filing state machine
src/lib/nlp/           multilingual rule parser, matcher, Claude adapter
src/server/services/   DB-backed services (every query scoped by businessId)
src/app/               screens + thin API routes
prisma/                schema, migrations (incl. immutability triggers), seed
tests/unit, tests/e2e  Vitest and Playwright
```

**Safety rules built into the code:**
- An LLM never issues invoices or computes tax; Claude only proposes mentions and raw numbers.
- Local ledger evidence beats user declarations.
- "Unknown" blocks nil filing.
- Compte never sends, receives or stores GSTN verification codes. GSTN-looking messages sent to Compte's own SMS inbox are rejected and redacted.
- Issued invoices are immutable: service checks, DB triggers and a snapshot hash.
- Login uses scrypt password hashes and DB-backed sessions (httpOnly, sameSite=lax, secure in production). Mutating requests get an origin check, and APIs are rate limited.

Rename the product by editing `src/lib/config/brand.ts` (or set `NEXT_PUBLIC_BRAND_NAME`).

More: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) · [docs/GST_COMPLIANCE_LIMITATIONS.md](docs/GST_COMPLIANCE_LIMITATIONS.md)

## Screenshots

See [docs/screenshots](docs/screenshots): dashboard, GSTR-1 preparation, mobile invoice review, nil-filing overview, the official SMS step, ARN recorded (unverified), Marathi UI, plus a sample invoice PDF and filing activity report (all DEMO data).
