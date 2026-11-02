import { D, dec, money, sumMoney, type Dec } from "./money";

/**
 * Deterministic GST engine. LLMs never compute tax: every number on an invoice comes from here.
 *
 * Supported: domestic B2B/B2C forward-charge supplies, single GST rate per line, tax-exclusive
 * or tax-inclusive unit prices, intra-state (CGST+SGST/UTGST) and inter-state (IGST).
 * Not supported (blocked upstream): cess, reverse charge, exports/SEZ, e-invoicing/IRN.
 *
 * Rounding policy: line-level, each tax head rounded to paise with ROUND_HALF_UP; invoice
 * totals are sums of rounded line values. No rupee round-off line is added.
 */

/**
 * Rates that exist in GST law (incl. special rates). Compte only checks that a rate is one of
 * these — it does NOT decide which rate applies to an HSN/SAC. That comes from the product's
 * configured (user-confirmed) tax settings.
 */
export const KNOWN_GST_RATES = ["0", "0.1", "0.25", "1", "1.5", "3", "5", "6", "7.5", "12", "18", "28", "40"] as const;

export type SupplyType = "INTRA" | "INTER";

export interface LineInput {
  quantity: string;
  unitPrice: string;
  gstRate: string;
  priceIncludesTax: boolean;
}

export interface LineTax {
  taxableValue: string;
  cgst: string;
  sgst: string;
  igst: string;
  lineTotal: string;
}

export interface InvoiceTotals {
  taxableTotal: string;
  cgstTotal: string;
  sgstTotal: string;
  igstTotal: string;
  grandTotal: string;
}

export class GstInputError extends Error {}

export function isKnownGstRate(rate: string): boolean {
  try {
    const r = dec(rate);
    return KNOWN_GST_RATES.some((k) => dec(k).equals(r));
  } catch {
    return false;
  }
}

export function determineSupplyType(supplierStateCode: string, placeOfSupplyStateCode: string): SupplyType {
  if (!supplierStateCode || !placeOfSupplyStateCode) throw new GstInputError("Supplier state and place of supply are both required");
  // "97 Other Territory" is always treated as inter-state per IGST Act s.8 practice
  if (placeOfSupplyStateCode === "97") return "INTER";
  return supplierStateCode === placeOfSupplyStateCode ? "INTRA" : "INTER";
}

function parsePositive(v: string, field: string, maxDp: number): Dec {
  let d: Dec;
  try {
    d = dec(String(v).trim());
  } catch {
    throw new GstInputError(`${field} is not a valid number`);
  }
  if (!d.isFinite() || d.lte(0)) throw new GstInputError(`${field} must be greater than zero`);
  if (d.decimalPlaces() > maxDp) throw new GstInputError(`${field} allows at most ${maxDp} decimal places`);
  return d;
}

export function computeLine(input: LineInput, supplyType: SupplyType): LineTax {
  const qty = parsePositive(input.quantity, "Quantity", 3);
  const price = parsePositive(input.unitPrice, "Unit price", 2);
  if (!isKnownGstRate(input.gstRate)) throw new GstInputError(`GST rate ${input.gstRate}% is not a recognised GST rate`);
  const rate = dec(input.gstRate);

  const gross = qty.times(price);
  const taxable = input.priceIncludesTax
    ? gross.times(100).dividedBy(dec(100).plus(rate)).toDecimalPlaces(2, D.ROUND_HALF_UP)
    : gross.toDecimalPlaces(2, D.ROUND_HALF_UP);

  let cgst = dec(0), sgst = dec(0), igst = dec(0);
  if (supplyType === "INTRA") {
    const half = rate.dividedBy(2);
    cgst = taxable.times(half).dividedBy(100).toDecimalPlaces(2, D.ROUND_HALF_UP);
    sgst = cgst; // equal halves by construction
  } else {
    igst = taxable.times(rate).dividedBy(100).toDecimalPlaces(2, D.ROUND_HALF_UP);
  }
  const total = taxable.plus(cgst).plus(sgst).plus(igst);
  return { taxableValue: money(taxable), cgst: money(cgst), sgst: money(sgst), igst: money(igst), lineTotal: money(total) };
}

export function computeInvoice(lines: LineInput[], supplyType: SupplyType): { lines: LineTax[]; totals: InvoiceTotals } {
  if (!lines.length) throw new GstInputError("At least one line item is required");
  const out = lines.map((l) => computeLine(l, supplyType));
  return {
    lines: out,
    totals: {
      taxableTotal: sumMoney(out.map((l) => l.taxableValue)),
      cgstTotal: sumMoney(out.map((l) => l.cgst)),
      sgstTotal: sumMoney(out.map((l) => l.sgst)),
      igstTotal: sumMoney(out.map((l) => l.igst)),
      grandTotal: sumMoney(out.map((l) => l.lineTotal)),
    },
  };
}

/** HSN (goods): 4, 6 or 8 digits. SAC (services): 6 digits starting with 99. */
export function validateHsnSac(code: string, kind: "GOODS" | "SERVICES"): string | null {
  const c = (code ?? "").trim();
  if (!c) return "HSN/SAC code is required";
  if (!/^\d+$/.test(c)) return "HSN/SAC must contain digits only";
  if (kind === "SERVICES") return /^99\d{4}$/.test(c) ? null : "SAC codes are 6 digits starting with 99";
  return [4, 6, 8].includes(c.length) ? null : "HSN codes must be 4, 6 or 8 digits";
}
