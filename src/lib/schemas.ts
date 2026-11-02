import { z } from "zod";
import { KNOWN_GST_RATES } from "./domain/gst";

export const decimalString = (maxDp: number) =>
  z.string().trim().regex(new RegExp(`^\\d{1,12}(\\.\\d{1,${maxDp}})?$`), `Enter a number with up to ${maxDp} decimals`);
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
export const stateCode = z.string().regex(/^\d{2}$/, "Select a state");
export const gstRateSchema = z.string().refine((v) => (KNOWN_GST_RATES as readonly string[]).includes(v), "Select a valid GST rate");
const phone = z.string().trim().regex(/^(\+91)?[6-9]\d{9}$/, "Enter a 10-digit Indian mobile number");

export const UNITS = ["NOS", "PCS", "BOX", "KGS", "LTR", "MTR", "BAG", "DOZ", "ROL", "SET", "HRS", "OTH"] as const;

export const BusinessInput = z.object({
  legalName: z.string().trim().min(2).max(120),
  tradeName: z.string().trim().max(120).optional().nullable(),
  gstin: z.string().trim().toUpperCase(),
  addressLine: z.string().trim().min(5).max(250),
  city: z.string().trim().min(2).max(60),
  pincode: z.string().trim().regex(/^[1-9]\d{5}$/, "6-digit PIN code"),
  stateCode,
  contactPerson: z.string().trim().min(2).max(80),
  phone,
  email: z.string().trim().email(),
  registrationType: z.enum(["REGULAR", "COMPOSITION", "CASUAL", "SEZ_UNIT", "SEZ_DEVELOPER"]),
  filingFrequency: z.enum(["MONTHLY", "QUARTERLY"]),
  financialYear: z.string().regex(/^\d{4}-\d{2}$/),
  eInvoiceMandatory: z.boolean(),
  preferredLanguage: z.enum(["en", "hi", "mr"]),
  invoicePrefix: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,5}$/, "1–5 capital letters/digits"),
  signatoryName: z.string().trim().min(2).max(80),
  signatoryDesignation: z.string().trim().min(2).max(60),
  phoneIsGstnRegistered: z.enum(["DECLARED_YES", "DECLARED_NO", "UNKNOWN"]),
});
export type BusinessInputT = z.infer<typeof BusinessInput>;

export const CustomerInput = z.object({
  name: z.string().trim().min(2).max(120),
  aliases: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  registrationStatus: z.enum(["REGISTERED", "UNREGISTERED"]),
  gstin: z.string().trim().toUpperCase().optional().nullable(),
  stateCode,
  billingAddress: z.string().trim().min(5).max(250),
  shippingAddress: z.string().trim().max(250).optional().nullable(),
  shippingStateCode: stateCode.optional().nullable(),
  phone: z.string().trim().max(15).optional().nullable(),
  email: z.string().trim().email().optional().nullable().or(z.literal("")),
});
export type CustomerInputT = z.infer<typeof CustomerInput>;

export const ProductInput = z.object({
  name: z.string().trim().min(2).max(120),
  aliases: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  description: z.string().trim().max(250).optional().nullable(),
  kind: z.enum(["GOODS", "SERVICES"]),
  hsnSac: z.string().trim(),
  unit: z.enum(UNITS),
  defaultPrice: decimalString(2),
  gstRate: gstRateSchema,
  priceIncludesTax: z.boolean(),
  taxEffectiveFrom: isoDate.optional().nullable(),
  taxConfirmed: z.literal(true, { message: "Confirm that HSN/SAC and GST rate are correct for this product" }),
});
export type ProductInputT = z.infer<typeof ProductInput>;

export const DraftLineInput = z.object({
  productId: z.string().nullable(),
  description: z.string().trim().max(200),
  quantity: z.string().trim().max(20),
  unitPrice: z.string().trim().max(20),
  gstRate: z.string().trim().max(5),
  priceIncludesTax: z.boolean(),
});
export const DraftUpdateInput = z.object({
  customerId: z.string().nullable(),
  invoiceDate: isoDate,
  placeOfSupplyStateCode: z.string().nullable(),
  placeOfSupplyConfirmed: z.boolean(),
  lines: z.array(DraftLineInput).max(50),
});
export type DraftUpdateInputT = z.infer<typeof DraftUpdateInput>;

export const IssueInput = z.object({
  idempotencyKey: z.string().min(8).max(100),
  expectedGrandTotal: z.string(),
  confirm: z.literal(true),
});

export const ExtractInput = z.object({
  text: z.string().trim().min(2).max(1000),
  language: z.enum(["auto", "en", "hi", "mr"]).default("auto"),
  source: z.enum(["TEXT", "VOICE"]).default("TEXT"),
});
