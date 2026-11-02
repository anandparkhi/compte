import { afterEach, describe, expect, it } from "vitest";
import { parseWithRules, detectLanguage } from "@/lib/nlp/parse-rules";
import { matchEntity } from "@/lib/nlp/match";
import { llmToParsedIntent } from "@/lib/nlp/claude-extract";
import type { Catalog, LlmExtraction } from "@/lib/nlp/types";
import { createDraftFromText, getInvoiceView, issueInvoice } from "@/server/services/invoices";
import { setLlmExtractorForTests } from "@/server/services/extraction";
import { makeBusiness, setTodayForTests } from "../helpers";

const catalog: Catalog = {
  customers: [
    { id: "c_ramesh", name: "Ramesh Traders", aliases: ["Ramesh", "रमेश ट्रेडर्स", "रमेश"] },
    { id: "c_rameshsteel", name: "Ramesh Steel Works", aliases: [] },
    { id: "c_sai", name: "Sai Packaging Pvt Ltd", aliases: ["Sai", "साई पॅकेजिंग"] },
  ],
  products: [
    { id: "p_box", name: "Plastic Storage Box", aliases: ["box", "बॉक्स", "डब्बा"], unit: "BOX" },
    { id: "p_tape", name: "BOPP Packing Tape", aliases: ["tape", "टेप"], unit: "ROL" },
  ],
};
const cat1: Catalog = { ...catalog, customers: catalog.customers.filter((c) => c.id !== "c_rameshsteel") };

describe("3–5. Multilingual extraction (deterministic rules)", () => {
  it("5. English", () => {
    const r = parseWithRules("Create a bill for Ramesh Traders for twenty boxes at five hundred rupees each, plus eighteen percent GST.", cat1);
    expect(r).toMatchObject({ language: "en", gstRate: "18", taxInclusion: "EXCLUSIVE" });
    expect(r.customer.matchedId).toBe("c_ramesh");
    expect(r.items[0]).toMatchObject({ quantity: "20", unitPrice: "500" });
    expect(r.items[0].product.matchedId).toBe("p_box");
  });
  it("3. Hindi", () => {
    const r = parseWithRules("रमेश ट्रेडर्स के लिए बीस बॉक्स का बिल बनाओ, हर बॉक्स पांच सौ रुपये का है, जीएसटी अलग से लगाओ।", cat1);
    expect(r).toMatchObject({ language: "hi", taxInclusion: "EXCLUSIVE", gstRate: null });
    expect(r.customer.matchedId).toBe("c_ramesh");
    expect(r.items[0]).toMatchObject({ quantity: "20", unitPrice: "500" });
  });
  it("4. Marathi", () => {
    const r = parseWithRules("रमेश ट्रेडर्सला वीस बॉक्स विकले, प्रत्येक पाचशे रुपये, जीएसटी वेगळा लावा.", cat1);
    expect(r).toMatchObject({ language: "mr", taxInclusion: "EXCLUSIVE" });
    expect(r.customer.matchedId).toBe("c_ramesh");
    expect(r.items[0]).toMatchObject({ quantity: "20", unitPrice: "500" });
  });
  it("code-mixed Hinglish and the SMS grammar", () => {
    const mixed = parseWithRules("Ramesh ko bees box beche, 500 rupaye each, GST eighteen percent. Bill bana do.", cat1);
    expect(mixed).toMatchObject({ language: "mixed", gstRate: "18" });
    expect(mixed.items[0]).toMatchObject({ quantity: "20", unitPrice: "500" }); // "bana do" is not read as 2
    const sms = parseWithRules("BILL RAMESH 20 BOX 500 GST18", cat1);
    expect(sms.customer.matchedId).toBe("c_ramesh");
    expect(sms.items[0]).toMatchObject({ quantity: "20", unitPrice: "500" });
    expect(sms.gstRate).toBe("18");
  });
  it("detects language", () => {
    expect(detectLanguage("Twenty boxes for Ramesh")).toBe("en");
    expect(detectLanguage("सुरेशला दोन बॉक्स विकले")).toBe("mr");
  });
});

describe("6. Customer matching", () => {
  it("matches by Devanagari alias with Marathi case suffix", () => {
    expect(matchEntity("रमेश ट्रेडर्सला", cat1.customers).matchedId).toBe("c_ramesh");
  });
  it("tolerates a one-letter typo on long names", () => {
    expect(matchEntity("Bill for Rameshh Traders", cat1.customers).matchedId).toBe("c_ramesh");
  });
  it("reports ambiguity instead of guessing", () => {
    const m = matchEntity("Ramesh ko 5 box", catalog.customers);
    expect(m.confidence).toBe("AMBIGUOUS");
    expect(m.matchedId).toBeNull();
    expect(m.candidates).toEqual(expect.arrayContaining(["c_ramesh", "c_rameshsteel"]));
  });
  it("does not match on generic words alone", () => {
    expect(matchEntity("Traders ko 5 box", cat1.customers).matchedId).toBeNull();
  });
});

describe("2. Claude extraction via mock fixtures", () => {
  afterEach(() => { setLlmExtractorForTests(undefined); setTodayForTests(null); });
  const fixture: LlmExtraction = {
    intent: "create_invoice", language: "mr", customer_mention: "रमेश ट्रेडर्स", customer_id: "c_ramesh",
    items: [{ product_mention: "बॉक्स", product_id: "p_box", quantity: 20, unit_price: 500, unit_mention: "बॉक्स" }],
    gst_rate_percent: 18, tax_inclusion: "exclusive", clarifications_needed: [],
  };
  it("maps a validated LLM extraction to an intent", () => {
    const r = llmToParsedIntent(fixture, cat1);
    expect(r).toMatchObject({ method: "CLAUDE", gstRate: "18", taxInclusion: "EXCLUSIVE" });
    expect(r.customer.matchedId).toBe("c_ramesh");
    expect(r.items[0]).toMatchObject({ quantity: "20", unitPrice: "500" });
  });
  it("never trusts catalog ids the business doesn't own", () => {
    const r = llmToParsedIntent({ ...fixture, customer_id: "someone_elses_id", customer_mention: "Ramesh Traders" }, cat1);
    expect(r.customer.matchedId).toBe("c_ramesh"); // re-matched deterministically from the mention
    const r2 = llmToParsedIntent({ ...fixture, customer_id: "evil", customer_mention: "Unknown Co" }, cat1);
    expect(r2.customer.matchedId).toBeNull();
  });
  it("service uses the LLM proposal but GST is still computed by the engine", async () => {
    setTodayForTests(() => "2026-11-01");
    const t = await makeBusiness();
    setLlmExtractorForTests({ extract: async () => ({ ...fixture, customer_id: t.ramesh.id, items: [{ ...fixture.items[0], product_id: t.box.id }] }) });
    const draft = await createDraftFromText(t.ctx, { text: "रमेश ट्रेडर्सला वीस बॉक्स…", source: "VOICE" });
    const v = await getInvoiceView(t.ctx, draft.id);
    expect(v.invoice.extractionMethod).toBe("CLAUDE");
    expect(v.computation!.totals).toMatchObject({ taxableTotal: "10000.00", cgstTotal: "900.00", sgstTotal: "900.00", grandTotal: "11800.00" });
  });
  it("falls back to rules when the LLM fails", async () => {
    setTodayForTests(() => "2026-11-01");
    const t = await makeBusiness();
    setLlmExtractorForTests({ extract: async () => { throw new Error("timeout"); } });
    const draft = await createDraftFromText(t.ctx, { text: "BILL RAMESH 20 BOX 500 GST18", source: "TEXT" });
    const v = await getInvoiceView(t.ctx, draft.id);
    expect(v.invoice.extractionMethod).toBe("RULES");
    expect(v.invoice.extractionNotes[0]).toMatch(/Claude extraction unavailable/);
  });
});

describe("7. Missing-field rejection", () => {
  afterEach(() => setTodayForTests(null));
  it("blocks issuance until customer, quantity and POS confirmation are resolved", async () => {
    setTodayForTests(() => "2026-11-01");
    const t = await makeBusiness();
    const draft = await createDraftFromText(t.ctx, { text: "Suresh ko box bhejo", source: "TEXT" });
    const v = await getInvoiceView(t.ctx, draft.id);
    const codes = v.computation!.issues.filter((i) => i.severity === "BLOCKER").map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(["CUSTOMER_REQUIRED", "POS_REQUIRED", "LINE_INVALID"]));
    expect(v.computation!.canIssue).toBe(false);
    expect(v.invoice.extractionNotes.join(" ")).toMatch(/Suresh.*not in your customer list/);
    await expect(issueInvoice(t.ctx, draft.id, { idempotencyKey: "k-missing-1", expectedGrandTotal: "0.00", confirm: true })).rejects.toMatchObject({ status: 422, code: "INVOICE_NOT_READY" });
  });
  it("requires explicit place-of-supply confirmation even when everything else is present", async () => {
    setTodayForTests(() => "2026-11-01");
    const t = await makeBusiness();
    const draft = await createDraftFromText(t.ctx, { text: "BILL RAMESH 20 BOX 500 GST18", source: "TEXT" });
    const v = await getInvoiceView(t.ctx, draft.id);
    expect(v.computation!.issues.map((i) => i.code)).toContain("POS_UNCONFIRMED");
    expect(v.computation!.totals.grandTotal).toBe("11800.00");
  });
});
