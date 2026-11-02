# Payments & bank/UPI reconciliation prototype
- Issued invoice screens show manual payment recording and the remaining invoice balance. Payments are separate records: invoice snapshots and GST figures remain immutable.
- WhatsApp opens a user-initiated wa.me share draft in English, Hindi or Marathi. The owner must review and press Send; the PDF itself must be shared separately. There is no Cloud API, automated sender, or messaging charge from Compte.
- Bank / UPI reconciliation lives at /bank-reconciliation. Upload the Compte-format CSV or XLSX with columns Date, Amount, Reference, Narration, and ISO dates (YYYY-MM-DD). Only positive credits are supported, max 2 MB / 500 rows.
- Preview file before committing. Import is idempotent per business by normalized transaction fingerprint. Unmatched credits show candidate issued invoices by exact remaining balance. Matching requires explicit user confirmation, never occurs automatically, and is audited.
- Real bank exports vary; users may need to reformat them into the documented template. Same-day identical credits without distinct references can be treated as duplicates, so use bank UTR/reference values.
- Manual payments cannot be edited or removed through the interface. Reconcile and investigate errors with an accountant.
- Before merging: regenerate and commit package-lock.json, test prisma generate, migrate deploy against staging Postgres, run npm typecheck and tests. This code has not been deployed.
