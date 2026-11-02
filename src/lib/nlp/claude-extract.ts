import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { matchEntity } from "./match";
import { LlmExtractionSchema, type Catalog, type EntityMatch, type LlmExtraction, type ParsedIntent } from "./types";

/**
 * Claude structured extraction. Claude ONLY returns mentions + raw quantities/prices/rate
 * as stated by the merchant. It never computes tax or totals and never issues anything.
 * Every returned catalog id is re-validated against the business's own catalog.
 */
export interface LlmExtractor {
  extract(text: string, catalog: Catalog, languageHint?: string): Promise<LlmExtraction>;
}

const TOOL = {
  name: "record_sales_transaction",
  description: "Record the structured details of a sales transaction described by an Indian small-business owner.",
  input_schema: {
    type: "object" as const,
    properties: {
      intent: { type: "string", enum: ["create_invoice", "other"] },
      language: { type: "string", enum: ["en", "hi", "mr", "mixed"] },
      customer_mention: { type: ["string", "null"], description: "Customer name exactly as said" },
      customer_id: { type: ["string", "null"], description: "id from the provided customer list ONLY if clearly the same customer, else null" },
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            product_mention: { type: ["string", "null"] },
            product_id: { type: ["string", "null"], description: "id from the provided product list ONLY if clearly the same product, else null" },
            quantity: { type: ["number", "null"] },
            unit_price: { type: ["number", "null"], description: "Price per unit as stated. null if only a total was given." },
            unit_mention: { type: ["string", "null"] },
          },
          required: ["product_mention", "product_id", "quantity", "unit_price", "unit_mention"],
        },
      },
      gst_rate_percent: { type: ["number", "null"], description: "GST rate only if the speaker stated it" },
      tax_inclusion: { type: "string", enum: ["exclusive", "inclusive", "unspecified"] },
      clarifications_needed: { type: "array", items: { type: "string" } },
    },
    required: ["intent", "language", "customer_mention", "customer_id", "items", "gst_rate_percent", "tax_inclusion", "clarifications_needed"],
  },
};

const SYSTEM = `You extract sales transactions spoken or typed by Indian small-business owners in English, Hindi, Marathi or code-mixed language.
Rules:
- Extract only what was said. Never guess missing numbers; use null.
- Convert number words in any language to digits (e.g. "पाचशे" = 500, "बीस" = 20, "bees" = 20).
- Do not compute tax or totals. Do not infer GST rates from product type.
- "GST extra/अलग से/वेगळा/plus GST" = exclusive; "including GST/सहित/धरून" = inclusive.
- Only return a customer_id/product_id that appears in the provided lists and clearly refers to the same entity.
- List anything ambiguous in clarifications_needed.`;

export function createClaudeExtractor(apiKey: string, model: string): LlmExtractor {
  const client = new Anthropic({ apiKey, timeout: 20_000, maxRetries: 1 });
  return {
    async extract(text, catalog, languageHint) {
      const catalogText = JSON.stringify({
        customers: catalog.customers.slice(0, 200).map((c) => ({ id: c.id, name: c.name, aliases: c.aliases })),
        products: catalog.products.slice(0, 200).map((p) => ({ id: p.id, name: p.name, aliases: p.aliases, unit: p.unit })),
      });
      const res = await client.messages.create({
        model,
        max_tokens: 1024,
        system: SYSTEM,
        tools: [TOOL],
        tool_choice: { type: "tool", name: TOOL.name },
        messages: [{ role: "user", content: `Catalog: ${catalogText}\nLanguage hint: ${languageHint ?? "auto"}\nMessage:\n"""${text}"""` }],
      });
      const block = res.content.find((b) => b.type === "tool_use");
      if (!block || block.type !== "tool_use") throw new Error("Claude returned no structured extraction");
      return LlmExtractionSchema.parse(block.input);
    },
  };
}

function numToStr(n: number | null): string | null {
  if (n === null || !Number.isFinite(n) || n <= 0) return null;
  // avoid binary float artefacts: LLM numbers are short decimals
  return String(Number(n.toFixed(3)));
}

function resolve(id: string | null, mention: string | null, list: { id: string; name: string; aliases: string[] }[]): EntityMatch {
  if (id && list.some((e) => e.id === id)) return { mention, matchedId: id, candidates: [], confidence: "EXACT" };
  if (mention) {
    const { matchedTokens: _m, ...m } = matchEntity(mention, list);
    void _m;
    return { ...m, mention };
  }
  return { mention, matchedId: null, candidates: [], confidence: "NONE" };
}

export function llmToParsedIntent(x: LlmExtraction, catalog: Catalog): ParsedIntent {
  const parsed = z.object({}).passthrough().safeParse(x);
  if (!parsed.success) throw new Error("invalid extraction");
  return {
    intent: x.intent === "create_invoice" ? "CREATE_INVOICE" : "UNKNOWN",
    language: x.language,
    customer: resolve(x.customer_id, x.customer_mention, catalog.customers),
    items: (x.items.length ? x.items : [{ product_mention: null, product_id: null, quantity: null, unit_price: null, unit_mention: null }]).map((it) => ({
      product: resolve(it.product_id, it.product_mention, catalog.products),
      quantity: numToStr(it.quantity),
      unitPrice: numToStr(it.unit_price),
      unitMention: it.unit_mention,
    })),
    gstRate: x.gst_rate_percent === null ? null : String(x.gst_rate_percent),
    taxInclusion: x.tax_inclusion === "exclusive" ? "EXCLUSIVE" : x.tax_inclusion === "inclusive" ? "INCLUSIVE" : null,
    method: "CLAUDE",
    notes: x.clarifications_needed,
  };
}
