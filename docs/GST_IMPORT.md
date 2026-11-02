# GST return file import (prototype)

Open **Settings → Import GST returns**.

Supports GSTR-1 JSON with `gstin`, `fp`, `b2b[].ctin`, `b2b[].inv[]` and optional `hsn.data`, `hsn.b2b`, `hsn.b2c`. Supports an .xlsx workbook with a first-row header of `GSTIN, Period, Recipient GSTIN, Invoice Number, Invoice Date, Invoice Value, Taxable Value, HSN, Description, UQC, Quantity, Rate`. Excel files must have one supplier GSTIN and period per file. This Excel layout is a **Compte import template**, not a claim of compatibility with all official GST workbook layouts.

Preview validates ownership GSTIN and period, shows counts and warnings; a separate explicit confirmation writes historical evidence and optionally creates missing customer placeholders. Already known GSTINs are not overwritten. HSN summaries are stored as historical records, not treated as current product rates. Issued invoices and return filing states are never modified. Duplicate file content (normalized parsed records) is recognized by a business-scoped unique fingerprint. This is an offline file import, **not** a live GSTN portal connection and not proof of filing.

Limits: 5 MB/file. Only common B2B and HSN data supported. Amendments, credit/debit notes, B2C, GSTR-2B, GSTR-3B, GSTN signatures, full template variation and full reconciliation are not yet supported. Verify all imported data against the portal before use. No automatic GST filing.

Before deployment run `npm install` and commit a regenerated package-lock.json, then `npx prisma generate && npx prisma migrate deploy`. Roll out through staging, test with anonymized official exports, and validate invoice/customer tenancy and deduplication.
