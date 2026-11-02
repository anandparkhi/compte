import { computeLine, determineSupplyType, GstInputError, isKnownGstRate, validateHsnSac, type LineTax, type SupplyType } from "./gst";
import { validateGstin } from "./gstin";
import { sumMoney } from "./money";
import { financialYearOf } from "./periods";
import { isSelectableStateCode } from "./states";

/** Pure validation + computation for a draft invoice. Used for preview AND at issuance. */
export interface IssueItem {
  code: string;
  severity: "BLOCKER" | "WARNING";
  message: string;
  line?: number;
}

export interface RuleBusiness {
  gstin: string;
  stateCode: string;
  eInvoiceMandatory: boolean;
  registrationType: string;
}
export interface RuleCustomer {
  id: string;
  name: string;
  registrationStatus: string;
  gstin: string | null;
  stateCode: string;
}
export interface RuleProduct {
  taxSource?: string;
  id: string;
  name: string;
  kind: string;
  hsnSac: string;
  unit: string;
  gstRate: string;
}
export interface RuleLine {
  productId: string | null;
  description: string;
  quantity: string;
  unitPrice: string;
  gstRate: string;
  priceIncludesTax: boolean;
}
export interface RuleDraft {
  customerId: string | null;
  invoiceDate: string; // YYYY-MM-DD
  placeOfSupplyStateCode: string | null;
  placeOfSupplySource: string | null;
  lines: RuleLine[];
}

export interface ComputedLine extends RuleLine {
  hsnSac: string;
  unit: string;
  tax: LineTax | null;
}

export interface DraftComputation {
  supplyType: SupplyType | null;
  lines: ComputedLine[];
  totals: { taxableTotal: string; cgstTotal: string; sgstTotal: string; igstTotal: string; grandTotal: string };
  issues: IssueItem[];
  financialYear: string | null;
  canIssue: boolean;
}

export function computeDraft(
  draft: RuleDraft,
  ctx: { business: RuleBusiness; customer: RuleCustomer | null; products: Map<string, RuleProduct>; today: string; nilConflict?: string | null },
): DraftComputation {
  const issues: IssueItem[] = [];
  const B = (code: string, message: string, line?: number) => issues.push({ code, severity: "BLOCKER", message, line });
  const W = (code: string, message: string, line?: number) => issues.push({ code, severity: "WARNING", message, line });
  const { business, customer } = ctx;

  if (business.eInvoiceMandatory) B("EINVOICE_NOT_SUPPORTED", "Your business is marked as subject to mandatory e-invoicing (IRN). Compte cannot issue e-invoices yet — use the IRP/your e-invoicing software.");
  if (business.registrationType === "COMPOSITION") B("COMPOSITION_NO_TAX_INVOICE", "Composition taxpayers issue a bill of supply, not a tax invoice. Not supported yet.");
  if (!validateGstin(business.gstin).valid) B("SUPPLIER_GSTIN_INVALID", "Your business GSTIN is not structurally valid — fix it in Settings.");

  if (!customer) B("CUSTOMER_REQUIRED", "Select the customer.");
  else if (customer.registrationStatus === "REGISTERED") {
    if (!validateGstin(customer.gstin ?? "").valid) B("CUSTOMER_GSTIN_INVALID", `${customer.name}'s GSTIN is missing or invalid — edit the customer.`);
  } else {
    W("B2C_INVOICE", `${customer.name} is unregistered — this is a B2C invoice (no buyer GSTIN).`);
  }

  // dates
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.invoiceDate)) B("DATE_INVALID", "Invoice date is invalid.");
  else if (draft.invoiceDate > ctx.today) B("DATE_IN_FUTURE", "Invoice date cannot be in the future.");
  const fy = /^\d{4}-\d{2}-\d{2}$/.test(draft.invoiceDate) ? financialYearOf(draft.invoiceDate) : null;
  if (ctx.nilConflict) B("NIL_RETURN_CONFLICT", ctx.nilConflict);

  // place of supply
  let supplyType: SupplyType | null = null;
  if (!draft.placeOfSupplyStateCode || !isSelectableStateCode(draft.placeOfSupplyStateCode)) B("POS_REQUIRED", "Select the place of supply.");
  else {
    supplyType = determineSupplyType(business.stateCode, draft.placeOfSupplyStateCode);
    if (draft.placeOfSupplySource !== "USER_CONFIRMED") B("POS_UNCONFIRMED", "Confirm the place of supply (it was suggested from the customer's delivery state).");
  }

  if (!draft.lines.length) B("NO_LINES", "Add at least one item.");

  const lines: ComputedLine[] = draft.lines.map((l, i) => {
    const n = i + 1;
    const product = l.productId ? ctx.products.get(l.productId) : undefined;
    if (l.productId && !product) B("PRODUCT_NOT_FOUND", `Item ${n}: product not found.`, n);
    if (!product) B("PRODUCT_REQUIRED", `Item ${n}${l.description ? ` (“${l.description}”)` : ""}: choose a product from your catalog — HSN/SAC and GST rate come from your product settings.`, n);
    const hsnSac = product?.hsnSac ?? "";
    const unit = product?.unit ?? "";
    if (product) {
      if (product.taxSource === "HISTORICAL_IMPORT_UNVERIFIED") B("IMPORTED_PRODUCT_UNVERIFIED", `Item ${n}: this product was suggested from an old GST return. Review and confirm its HSN/SAC, tax rate and price in Products before issuing.`, n);
      const hsnErr = validateHsnSac(product.hsnSac, product.kind as "GOODS" | "SERVICES");
      if (hsnErr) B("HSN_INVALID", `Item ${n}: ${hsnErr} (fix it on the product).`, n);
      if (l.gstRate && l.gstRate !== product.gstRate) W("RATE_DIFFERS_FROM_PRODUCT", `Item ${n}: GST rate ${l.gstRate}% differs from the product's configured ${product.gstRate}%. Make sure ${l.gstRate}% is correct for HSN ${product.hsnSac}.`, n);
    }
    if (!l.description.trim()) B("DESCRIPTION_REQUIRED", `Item ${n}: description is required.`, n);
    if (!l.gstRate || !isKnownGstRate(l.gstRate)) B("RATE_INVALID", `Item ${n}: GST rate is missing or not a recognised GST rate.`, n);
    let tax: LineTax | null = null;
    if (supplyType && l.gstRate && isKnownGstRate(l.gstRate)) {
      try {
        tax = computeLine({ quantity: l.quantity, unitPrice: l.unitPrice, gstRate: l.gstRate, priceIncludesTax: l.priceIncludesTax }, supplyType);
      } catch (e) {
        if (e instanceof GstInputError) B("LINE_INVALID", `Item ${n}: ${e.message}.`, n);
        else throw e;
      }
    } else if (!supplyType) {
      // still validate numbers so the user sees all problems at once
      try { computeLine({ quantity: l.quantity, unitPrice: l.unitPrice, gstRate: isKnownGstRate(l.gstRate) ? l.gstRate : "0", priceIncludesTax: l.priceIncludesTax }, "INTRA"); }
      catch (e) { if (e instanceof GstInputError) B("LINE_INVALID", `Item ${n}: ${e.message}.`, n); }
    }
    return { ...l, hsnSac, unit, tax };
  });

  const computed = lines.map((l) => l.tax).filter((t): t is LineTax => !!t);
  const totals = {
    taxableTotal: sumMoney(computed.map((t) => t.taxableValue)),
    cgstTotal: sumMoney(computed.map((t) => t.cgst)),
    sgstTotal: sumMoney(computed.map((t) => t.sgst)),
    igstTotal: sumMoney(computed.map((t) => t.igst)),
    grandTotal: sumMoney(computed.map((t) => t.lineTotal)),
  };
  const canIssue = !issues.some((i) => i.severity === "BLOCKER") && computed.length === lines.length && lines.length > 0;
  return { supplyType, lines, totals, issues, financialYear: fy, canIssue };
}
