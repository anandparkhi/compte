# GST compliance notes and limitations

Compte is **not** GSTN-approved, is **not** a GST Suvidha Provider (GSP), and is not a substitute for a chartered accountant. This document lists what was verified, what is deliberately conservative, and what **must be re-verified before production use**.

_Last reviewed: 1 November 2026._

## 1. Verified against official sources (Nov 2026)

| Rule | Source | Where in code |
|---|---|---|
| Nil SMS formats: `NIL R1 <GSTIN> <MMYYYY>`, `NIL 3B <GSTIN> <MMYYYY>`, confirmation `CNF R1/3B <code>`, help `HELP R1/3B`, all sent to **14409** | tutorial.gst.gov.in FAQs: *Filing Nil Form GSTR-1 through SMS* and *Filing Nil Form GSTR-3B through SMS*, plus *Troubleshooting Errors* | `src/lib/domain/gstn-sms.ts` |
| Quarterly filers use the last month of the quarter (e.g. `062026` for Apr–Jun) | same FAQs | `periods.ts`, `gstn-sms.ts` |
| Verification code: 6 digits, valid 30 minutes, single use; a new code invalidates the old one; wait 5 minutes before re-requesting; more than 3 wrong codes in a day blocks that GSTIN+mobile for 24 hours | same FAQs | shown in the wizard; `config/brand.ts` |
| Nil filing opens on the 1st of the month after the period | same FAQs | `isPeriodEnded` |
| SMS route requires: Normal/Casual/SEZ unit/SEZ developer registration; monthly/quarterly frequency; the authorised signatory's registered mobile, not shared with another signatory; **no saved/submitted data** for that return on the portal | same FAQs | `nil-eligibility.ts` |
| Nil GSTR-1 = no outward supplies, no amendments, no credit/debit notes, no advances | GSTR-1 nil FAQ | `nil-eligibility.ts` |
| Nil GSTR-3B = no outward or reverse-charge supplies, no ITC to claim or reverse, no tax/interest/late-fee liability for this or earlier periods, **all earlier GSTR-3B filed** | GSTR-3B nil FAQ | `nil-eligibility.ts` |
| Filed nil returns cannot be revised; an ARN is sent by SMS and email; status is tracked on the portal | same FAQs | wizard copy, report |
| Invoice number: consecutive, ≤ 16 characters, only `-` and `/` as special characters (Rule 46(b)) | CGST Rules, Rule 46 | `invoice-number.ts` |
| Mandatory invoice particulars (supplier/recipient details, GSTIN, HSN/SAC, description, quantity and unit, taxable value, rate, tax amounts by head, place of supply with state, delivery address if different, reverse-charge indicator, signature) | Rule 46 | `services/pdf.ts` |
| GSTIN check-digit algorithm (validated against GSTN's sample `07AQDPP8277H8Z6`) | GSTN documentation | `gstin.ts` |
| Sarvam STT REST API (`/speech-to-text`, `api-subscription-key`, ≤ 30 s audio) | docs.sarvam.ai | `services/stt.ts` |

## 2. Deliberately conservative (Compte blocks where the law might allow)
- **Nil-rated, exempt, zero-rated and non-GST supplies** block nil filing for both returns. They are reportable in GSTR-1 (Table 8) and GSTR-3B.
- **IFF uploads** in months 1–2 of a quarter block a quarterly nil GSTR-1.
- **GSTR-2B entries or auto-populated GSTR-3B values** send the case to *manual review* instead of allowing a nil filing.
- **Draft invoices** dated in the period require review before nil filing.
- **Any "Not sure" answer** keeps eligibility *unverified* and blocks the SMS step.
- After a nil GSTR-1 reaches the SMS step, Compte blocks new invoices dated in that period.

## 3. Not verified: must check before production
1. **Official GSTR-1 JSON schema.** The schema couldn't be retrieved and validated (developer.gst.gov.in requires registration). Exports are therefore labelled `COMPTE_INTERNAL_DRAFT` / `portalUploadReady: false`. Field names follow the public offline-tool layout from memory, and the HSN B2B/B2C split and doc-issue tables need validation.
2. **B2CL threshold.** It is set to ₹1,00,000 in `services/returns.ts`; confirm against current notifications.
3. **ARN format.** Compte accepts 10–20 alphanumerics, because the exact format wasn't verified from an official source.
4. **Sequential-filing rules.** GSTR-1 dependency on earlier GSTR-1/3B is handled only through the user's declaration and the portal check.
5. **GST rates.** Compte validates that a rate is one that exists in GST law. It does **not** know which rate applies to an HSN, including the 2025 rate rationalisation. Demo products are fictional configuration, labelled `DEMO_SEED`.
6. **HSN digit requirements by turnover** (4 vs 6 digits). Compte accepts 4, 6 or 8 digits for goods and does not check turnover.
7. **Place of supply.** Compte suggests the delivery state for goods and the recipient state for services, and always asks the user to confirm. Special cases are not modelled: bill-to-ship-to with a third party, services under IGST s.12/13 exceptions, exports/SEZ, and Other Territory nuances.
8. **Rounding.** Tax is rounded at line level to paise (half-up), and no rupee round-off line is added. Confirm this with your accountant. Section 170 rounding applies to amounts paid in returns.
9. **e-invoicing.** Businesses that declare mandatory e-invoicing are blocked from issuing invoices. The current AATO threshold is not checked.
10. **Signature.** PDFs carry the signatory's name and "Authorised Signatory". Digital signatures (DSC) are not applied.
11. **Live end-to-end SMS filing.** It has **never been performed**. An authorised taxpayer should run one real nil filing and verify the result on the portal before this flow is marketed as live.
12. **`sms:` composer handoff.** The handoff was not tested on physical iOS/Android devices, and some SMS apps ignore prefilled bodies. Copy is always offered.

## 4. Out of scope for this MVP
Non-nil return submission, GSP/API filing, portal status verification, live GSTIN verification, credit/debit notes, amendments, purchases/ITC, full GSTR-3B, reverse-charge invoicing, cess, exports/SEZ, composition (bill of supply), e-way bills, e-invoicing/IRN, TDS/TCS.

## 5. Things Compte will never do
- Store GST portal passwords, or receive, proxy or store GSTN SMS verification codes.
- Send government SMS from its own number or backend, or submit confirmations automatically.
- Mark a return "filed" because a user said they sent an SMS, or "verified" without an official source.
- Let a declaration override contradictory records in Compte's own books.
