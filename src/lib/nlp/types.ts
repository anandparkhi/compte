import { z } from "zod";

export type Lang = "en" | "hi" | "mr" | "mixed";

export interface CatalogCustomer {
  id: string;
  name: string;
  aliases: string[];
}
export interface CatalogProduct {
  id: string;
  name: string;
  aliases: string[];
  unit: string;
}
export interface Catalog {
  customers: CatalogCustomer[];
  products: CatalogProduct[];
}

export type TaxInclusion = "EXCLUSIVE" | "INCLUSIVE" | null;

export interface EntityMatch {
  mention: string | null;
  matchedId: string | null;
  /** other plausible catalog ids when the match is ambiguous */
  candidates: string[];
  confidence: "EXACT" | "PARTIAL" | "FUZZY" | "UNIT_ONLY" | "NONE" | "AMBIGUOUS";
}

export interface ParsedItem {
  product: EntityMatch;
  quantity: string | null;
  unitPrice: string | null;
  unitMention: string | null;
}

export interface ParsedIntent {
  intent: "CREATE_INVOICE" | "UNKNOWN";
  language: Lang;
  customer: EntityMatch;
  items: ParsedItem[];
  gstRate: string | null;
  taxInclusion: TaxInclusion;
  method: "RULES" | "CLAUDE";
  /** human-readable notes shown on the review screen (assumptions, ambiguities) */
  notes: string[];
}

/** Schema the LLM must fill. It extracts mentions and raw numbers only — never totals or tax. */
export const LlmExtractionSchema = z.object({
  intent: z.enum(["create_invoice", "other"]),
  language: z.enum(["en", "hi", "mr", "mixed"]),
  customer_mention: z.string().nullable(),
  customer_id: z.string().nullable(),
  items: z
    .array(
      z.object({
        product_mention: z.string().nullable(),
        product_id: z.string().nullable(),
        quantity: z.number().positive().nullable(),
        unit_price: z.number().positive().nullable(),
        unit_mention: z.string().nullable(),
      }),
    )
    .max(20),
  gst_rate_percent: z.number().min(0).max(40).nullable(),
  tax_inclusion: z.enum(["exclusive", "inclusive", "unspecified"]),
  clarifications_needed: z.array(z.string()).max(10),
});
export type LlmExtraction = z.infer<typeof LlmExtractionSchema>;
