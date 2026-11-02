# Compte owner-journey UX review (2 November 2026)

This branch is a code-level review of the core business-owner journeys, grounded in user screenshots and the current Next.js pages. **It is not a claim of a full usability study, live portal verification, or mobile-browser visual QA.**

## Screen-by-screen changes

| Screen | Problem found | Fix |
| --- | --- | --- |
| Home | Zero-valued KPI cards contradicted imported B2B history | Primary cards combine recorded taxable sales and invoice value, with an explicit imported/new breakdown |
| Home | Opened a current month with no records while historical activity existed | Defaults to the most recent month with actual invoices when nothing is recorded this month; month picker and imported-month shortcuts remain visible |
| Home | Selected month was not linked to its invoices | All core invoice figures drill down to a month-filtered invoice list |
| Home | "GST collected" zero looked like an official historical tax total | Removed it from the primary tiles; tax on *new Compte invoices* is labeled separately |
| Home | Dense create-invoice hero and incomplete source information | Clear two-action primary area, source explanation, concise return summary and customer activity |
| Invoices | History was a static secondary list; imported invoices were not clickable | Source-filtered chronological list with read-only historical detail pages and time/customer filters |
| Invoice details | No clear distinction between an imported record and a newly issued invoice | Historical route shows record source, invoice values, GST period and limitations; no issue, edit or payment actions |
| GST Returns | "No sales" / ₹0 appeared despite imported data | Main per-period activity cards use imported + new records and clear source disclosure |
| GST Returns | "Nil not started" alongside reported sales and nil action | Status is presented as *portal filing unverified*; nil CTA is suppressed where business records show sales |
| Nil filing | Eligibility engine ignored imported GST history | Imported outward activity is an explicit blocking check; the actual nil flow is gated, not just the screen |
| GST detail | Imported records appeared only as a sidebar after zero metrics | Combined invoice counts/taxable figures are primary; historical rows open read-only details; imported HSN rows visible separately |
| GST monthly trend | Quarterly GSTR-1 `fp` was misused as each invoice's sale month | Month allocation is based on valid invoice dates; fallback to reporting month when date is absent/invalid |
| Products | Unverified HSN products showed ₹0 and a GST badge as if usable | Separate "Needs review" section with "Set price" action; issuance engine blocks unconfirmed imported product suggestions |
| Customers | Imported GSTIN placeholders looked like finished customers | Clear "details needed" label and explanation; customer history can include imported invoices |
| GST import | Count-only preview, cryptic hash, no confirmation outcome/navigation | Preview shows taxable totals and sample invoices, user explicitly confirms, and success links point to invoices, returns and products |
| GST import | No obvious record of earlier imports | Recent imported periods are displayed with drill-down links |
| Bank / UPI | Count-only preview and ambiguous automatic-match expectation | Preview total/rows, documented sample, unmatched state and explicit confirmation warnings |
| Payment / WhatsApp | Raw controls, unclear payment status and missing-phone dead end | Balance overview, separate record/share actions, required user confirmation, edit-customer link; viewer role cannot submit |
| Navigation | Central mobile action text was truncated | Uses short localized "New" label |
| Settings | Technical area dominated business tasks | Business tools first; advanced invoice and compliance details collapsible |

## Scope and known limitations

- GST historical import currently supports selected GSTR-1 **B2B** and HSN data, not all B2C sections, amendments or credit/debit notes. Displayed historical totals are **partial**.
- Uploaded data is **not** proof of GSTN filing; no official portal filing status is changed by importing.
- Historical invoice overlaps are excluded when invoice month, number and recipient GSTIN exactly match a Compte-issued invoice. More complex corrections require accountant reconciliation.
- Historical invoice value is not cash received, net profit or exact GST payable.
- Main dashboard text is localized through an extensible en/hi/mr dictionary. Some secondary-screen help text still needs a full professional translation pass; do not claim full end-to-end localization yet.
- Statements use a Compte-format CSV/XLSX template. They are **not** live bank connections. Suggested matches are based on amount and require manual confirmation.
- Complete validation requires GitHub CI (Prisma generation, typecheck, migrations, tests and Next.js build), a staging deployment, and real-device accessibility/usability testing with anonymized GST examples. Do not deploy to production merely because source code was committed.

## Deployment gate

1. CI green on this branch, including migrations against disposable PostgreSQL.
2. Verify both monthly and quarterly businesses using actual anonymized source files.
3. Review historical overlap and nil eligibility behavior.
4. Validate mobile layout and locale switching in a preview deployment.
5. Merge through the pull request, then verify Vercel production.
