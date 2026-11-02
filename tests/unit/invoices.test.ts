import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { createDraftFromText, discardDraft, getInvoiceForDocument, getInvoiceView, issueInvoice, listInvoices, readVerifiedSnapshot, updateDraft } from "@/server/services/invoices";
import { renderInvoicePdf, renderInvoicePdfFallback } from "@/server/services/pdf";
import { gstr1Preparation, exportGstr1InternalDraft, periodSummaries } from "@/server/services/returns";
import { dashboard } from "@/server/services/dashboard";
import { emailInvoice } from "@/server/services/email";
import { listCustomers, createCustomer } from "@/server/services/catalog";
import { AppError } from "@/server/errors";
import { issueFor, makeBusiness, setTodayForTests } from "../helpers";

beforeEach(() => setTodayForTests(() => "2026-11-01"));
afterEach(() => setTodayForTests(null));

describe("Sample transaction end-to-end (service level)", () => {
  it("Ramesh Traders, 20 boxes, ₹500 each, 18% exclusive → 10,000 + 900 + 900 = 11,800", async () => {
    const t = await makeBusiness();
    const d = await createDraftFromText(t.ctx, { text: "Ramesh Traders, 20 boxes, ₹500 each, 18% GST exclusive", source: "TEXT" });
    let v = await getInvoiceView(t.ctx, d.id);
    v = await updateDraft(t.ctx, d.id, { customerId: v.invoice.customerId, invoiceDate: "2026-11-01", placeOfSupplyStateCode: "27", placeOfSupplyConfirmed: true, lines: v.invoice.lineItems.map((l) => ({ productId: l.productId, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, gstRate: l.gstRate, priceIncludesTax: l.priceIncludesTax })) });
    expect(v.computation!.canIssue).toBe(true);
    const { invoice } = await issueInvoice(t.ctx, d.id, { idempotencyKey: "sample-1-key", expectedGrandTotal: "11800.00", confirm: true });
    expect(invoice).toMatchObject({ status: "ISSUED", invoiceNumber: "TB/26-27/0001", taxableTotal: "10000.00", cgstTotal: "900.00", sgstTotal: "900.00", igstTotal: "0.00", grandTotal: "11800.00" });
  });
});

describe("11. FY numbering through issuance", () => {
  it("numbers consecutively and restarts for a new financial year", async () => {
    const t = await makeBusiness();
    const a = await issueFor(t, "2026-10-01", t.ramesh, [{ productId: t.box.id, quantity: "1", unitPrice: "100" }]);
    const b = await issueFor(t, "2026-10-02", t.ramesh, [{ productId: t.box.id, quantity: "1", unitPrice: "100" }]);
    expect([a.invoiceNumber, b.invoiceNumber]).toEqual(["TB/26-27/0001", "TB/26-27/0002"]);
    setTodayForTests(() => "2027-04-02");
    const c = await issueFor(t, "2027-04-01", t.ramesh, [{ productId: t.box.id, quantity: "1", unitPrice: "100" }]);
    expect(c.invoiceNumber).toBe("TB/27-28/0001");
    expect(c.financialYear).toBe("2027-28");
  });
});

describe("12. Duplicate issuance prevention & immutability", () => {
  it("replays the same idempotency key and refuses a second issuance", async () => {
    const t = await makeBusiness();
    const d = await createDraftFromText(t.ctx, { text: "BILL RAMESH 2 BOX 500 GST18", source: "TEXT" });
    const v = await getInvoiceView(t.ctx, d.id);
    await updateDraft(t.ctx, d.id, { customerId: v.invoice.customerId, invoiceDate: "2026-11-01", placeOfSupplyStateCode: "27", placeOfSupplyConfirmed: true, lines: v.invoice.lineItems.map((l) => ({ ...l, priceIncludesTax: false })) });
    const first = await issueInvoice(t.ctx, d.id, { idempotencyKey: "dup-key-123", expectedGrandTotal: "1180.00", confirm: true });
    const replay = await issueInvoice(t.ctx, d.id, { idempotencyKey: "dup-key-123", expectedGrandTotal: "1180.00", confirm: true });
    expect(replay.replayed).toBe(true);
    expect(replay.invoice.invoiceNumber).toBe(first.invoice.invoiceNumber);
    await expect(issueInvoice(t.ctx, d.id, { idempotencyKey: "another-key-1", expectedGrandTotal: "1180.00", confirm: true })).rejects.toMatchObject({ code: "ALREADY_ISSUED" });
    expect(await prisma.invoice.count({ where: { businessId: t.business.id, status: "ISSUED" } })).toBe(1);
  });
  it("rejects a stale confirmation when the total changed", async () => {
    const t = await makeBusiness();
    const d = await createDraftFromText(t.ctx, { text: "BILL RAMESH 2 BOX 500 GST18", source: "TEXT" });
    const v = await getInvoiceView(t.ctx, d.id);
    await updateDraft(t.ctx, d.id, { customerId: v.invoice.customerId, invoiceDate: "2026-11-01", placeOfSupplyStateCode: "27", placeOfSupplyConfirmed: true, lines: v.invoice.lineItems.map((l) => ({ ...l, priceIncludesTax: false })) });
    await expect(issueInvoice(t.ctx, d.id, { idempotencyKey: "stale-key-1", expectedGrandTotal: "999.00", confirm: true })).rejects.toMatchObject({ code: "STALE_CONFIRMATION" });
  });
  it("blocks edits/deletes of issued invoices in the service AND the database", async () => {
    const t = await makeBusiness();
    const inv = await issueFor(t, "2026-10-05", t.ramesh, [{ productId: t.box.id, quantity: "1", unitPrice: "100" }]);
    await expect(updateDraft(t.ctx, inv.id, { customerId: t.ramesh.id, invoiceDate: "2026-10-05", placeOfSupplyStateCode: "27", placeOfSupplyConfirmed: true, lines: [] })).rejects.toMatchObject({ code: "INVOICE_IMMUTABLE" });
    await expect(discardDraft(t.ctx, inv.id)).rejects.toMatchObject({ code: "INVOICE_IMMUTABLE" });
    // SQLite triggers abort the write (Prisma surfaces RAISE(ABORT) as a constraint error)
    await expect(prisma.invoice.update({ where: { id: inv.id }, data: { grandTotal: "1.00" } })).rejects.toThrow();
    await expect(prisma.invoiceLineItem.updateMany({ where: { invoiceId: inv.id }, data: { quantity: "999" } })).rejects.toThrow();
    await expect(prisma.invoice.delete({ where: { id: inv.id } })).rejects.toThrow();
    await expect(prisma.$executeRawUnsafe(`UPDATE "Invoice" SET "grandTotal" = '1.00' WHERE "id" = '${inv.id}'`)).rejects.toThrow(/immutable/);
    const after = await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id }, include: { lineItems: true } });
    expect(after.grandTotal).toBe("118.00");
    expect(after.lineItems[0].quantity).toBe("1");
  });
  it("detects tampering of the stored snapshot", async () => {
    const t = await makeBusiness();
    const inv = await issueFor(t, "2026-10-05", t.ramesh, [{ productId: t.box.id, quantity: "1", unitPrice: "100" }]);
    expect(() => readVerifiedSnapshot({ ...inv, snapshot: inv.snapshot!.replace("118.00", "18.00") })).toThrow(/integrity/);
  });
});

describe("13. PDF generation", () => {
  it("renders a real PDF from the issued snapshot, including Devanagari names", async () => {
    const t = await makeBusiness();
    const c = await createCustomer(t.ctx, { name: "श्री गणेश ट्रेडर्स", aliases: [], registrationStatus: "UNREGISTERED", stateCode: "27", billingAddress: "पुणे 411001" });
    const inv = await issueFor(t, "2026-10-05", c, [{ productId: t.box.id, quantity: "20", unitPrice: "500" }]);
    const { snapshot } = await getInvoiceForDocument(t.ctx, inv.id);
    const pdf = await renderInvoicePdf(snapshot);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(5000);
    expect(snapshot.recipient.name).toBe("श्री गणेश ट्रेडर्स");
    expect(snapshot.amountInWords).toMatch(/Eleven Thousand Eight Hundred/);
  });
  it("refuses a PDF for a draft", async () => {
    const t = await makeBusiness();
    const d = await createDraftFromText(t.ctx, { text: "BILL RAMESH 2 BOX 500 GST18", source: "TEXT" });
    await expect(getInvoiceForDocument(t.ctx, d.id)).rejects.toMatchObject({ code: "NOT_ISSUED" });
  });
});

describe("Production PDF recovery", () => {
  it("renders a valid multilingual invoice copy using the fallback layout", async () => {
    const t = await makeBusiness();
    const c = await createCustomer(t.ctx, {
      name: "श्री गणेश ट्रेडर्स", aliases: [], registrationStatus: "UNREGISTERED",
      stateCode: "27", billingAddress: "पुणे 411001",
    });
    const inv = await issueFor(t, "2026-10-05", c, [{ productId: t.box.id, quantity: "2", unitPrice: "500" }]);
    const { snapshot } = await getInvoiceForDocument(t.ctx, inv.id);
    const pdf = await renderInvoicePdfFallback(snapshot, false);
    expect(pdf.subarray(0,5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1000);
  });
});

describe("14–15. Ledger and return-period inclusion", () => {
  it("14. issued invoices update the ledger and dashboard; drafts do not count as sales", async () => {
    const t = await makeBusiness();
    await issueFor(t, "2026-10-10", t.ramesh, [{ productId: t.box.id, quantity: "20", unitPrice: "500" }]);
    await issueFor(t, "2026-10-12", t.sai, [{ productId: t.tape.id, quantity: "100", unitPrice: "45" }]);
    await createDraftFromText(t.ctx, { text: "BILL RAMESH 1 BOX 500 GST18", source: "TEXT" });
    const d = await dashboard(t.ctx, "102026");
    expect(d.totals).toMatchObject({ issuedCount: 2, taxable: "14500.00", gst: "2610.00", invoiceValue: "17110.00", draftCount: 1 });
    expect(d.customers[0]).toMatchObject({ name: "Ramesh Traders", count: 1, taxable: "10000.00" });
    const issued = await listInvoices(t.ctx, { status: "ISSUED" });
    expect(issued).toHaveLength(2);
    expect(issued.find((i) => i.customerId === t.sai.id)?.igstTotal).toBe("810.00");
  });
  it("15. invoices land in the right GSTR-1 period (boundary dates)", async () => {
    const t = await makeBusiness();
    await issueFor(t, "2026-09-30", t.ramesh, [{ productId: t.box.id, quantity: "1", unitPrice: "100" }]);
    await issueFor(t, "2026-10-01", t.sai, [{ productId: t.box.id, quantity: "1", unitPrice: "100" }]);
    const sep = await gstr1Preparation(t.ctx, "092026");
    const oct = await gstr1Preparation(t.ctx, "102026");
    expect(sep.documents.count).toBe(1);
    expect(sep.b2b[0].recipient.name).toBe("Ramesh Traders");
    expect(oct.documents.count).toBe(1);
    expect(oct.totals.igst).toBe("18.00");
    const summaries = await periodSummaries(t.ctx, "2026-27");
    expect(summaries.find((s) => s.period.key === "092026")?.issuedCount).toBe(1);
  });
  it("exports a clearly labelled internal draft (never 'portal-ready')", async () => {
    const t = await makeBusiness();
    await issueFor(t, "2026-10-10", t.ramesh, [{ productId: t.box.id, quantity: "20", unitPrice: "500" }]);
    const { json, filename } = await exportGstr1InternalDraft(t.ctx, "102026");
    expect(filename).toMatch(/^COMPTE-INTERNAL-DRAFT_GSTR1_/);
    expect(json._compte).toMatchObject({ kind: "COMPTE_INTERNAL_DRAFT", portalUploadReady: false, schemaVerified: false });
    expect(json.b2b[0].inv[0]).toMatchObject({ inum: "TB/26-27/0001", idt: "10-10-2026", val: 11800, pos: "27" });
    expect(json.b2b[0].inv[0].itms[0].itm_det).toMatchObject({ txval: 10000, rt: 18, camt: 900, samt: 900 });
  });
});

describe("Email delivery honesty", () => {
  it("records NOT_SENT when no provider is configured and never claims delivery", async () => {
    const t = await makeBusiness();
    const inv = await issueFor(t, "2026-10-10", t.ramesh, [{ productId: t.box.id, quantity: "1", unitPrice: "100" }]);
    const r = await emailInvoice(t.ctx, inv.id, { to: "buyer@test.example" });
    expect(r.delivered).toBe(false);
    expect(r.status).toBe("NOT_SENT_PROVIDER_NOT_CONFIGURED");
    expect(await prisma.emailDelivery.count({ where: { invoiceId: inv.id, status: "NOT_SENT_PROVIDER_NOT_CONFIGURED" } })).toBe(1);
  });
});

describe("Compliance blocks at issuance", () => {
  it("blocks invoices for businesses that must e-invoice", async () => {
    const t = await makeBusiness({ eInvoice: true });
    await expect(issueFor(t, "2026-10-10", t.ramesh, [{ productId: t.box.id, quantity: "1", unitPrice: "100" }])).rejects.toMatchObject({ code: "INVOICE_NOT_READY" });
  });
  it("blocks future-dated invoices", async () => {
    const t = await makeBusiness();
    await expect(issueFor(t, "2026-11-05", t.ramesh, [{ productId: t.box.id, quantity: "1", unitPrice: "100" }])).rejects.toBeInstanceOf(AppError);
  });
});

describe("34. Business-level authorization and tenant isolation", () => {
  it("one business cannot read, edit, issue or export another's records", async () => {
    const a = await makeBusiness();
    const b = await makeBusiness();
    const inv = await issueFor(a, "2026-10-10", a.ramesh, [{ productId: a.box.id, quantity: "1", unitPrice: "100" }]);
    const draft = await createDraftFromText(a.ctx, { text: "BILL RAMESH 1 BOX 500 GST18", source: "TEXT" });
    await expect(getInvoiceView(b.ctx, inv.id)).rejects.toMatchObject({ status: 404 });
    await expect(getInvoiceForDocument(b.ctx, inv.id)).rejects.toMatchObject({ status: 404 });
    await expect(issueInvoice(b.ctx, draft.id, { idempotencyKey: "cross-tenant-1", expectedGrandTotal: "590.00", confirm: true })).rejects.toMatchObject({ status: 404 });
    await expect(discardDraft(b.ctx, draft.id)).rejects.toMatchObject({ status: 404 });
    await expect(updateDraft(b.ctx, draft.id, { customerId: null, invoiceDate: "2026-11-01", placeOfSupplyStateCode: null, placeOfSupplyConfirmed: false, lines: [] })).rejects.toMatchObject({ status: 404 });
    // B cannot attach A's customer/product to its own draft
    const bDraft = await createDraftFromText(b.ctx, { text: "BILL RAMESH 1 BOX 500 GST18", source: "TEXT" });
    await expect(updateDraft(b.ctx, bDraft.id, { customerId: a.ramesh.id, invoiceDate: "2026-11-01", placeOfSupplyStateCode: "27", placeOfSupplyConfirmed: true, lines: [] })).rejects.toMatchObject({ status: 404 });
    await expect(updateDraft(b.ctx, bDraft.id, { customerId: b.ramesh.id, invoiceDate: "2026-11-01", placeOfSupplyStateCode: "27", placeOfSupplyConfirmed: true, lines: [{ productId: a.box.id, description: "x", quantity: "1", unitPrice: "1", gstRate: "18", priceIncludesTax: false }] })).rejects.toMatchObject({ status: 404 });
    expect((await listInvoices(b.ctx)).every((i) => i.businessId === b.business.id)).toBe(true);
    expect((await listCustomers(b.ctx)).every((c) => c.businessId === b.business.id)).toBe(true);
    expect((await gstr1Preparation(b.ctx, "102026")).documents.count).toBe(0);
  });
  it("read-only members cannot create or issue", async () => {
    const v = await makeBusiness({ role: "VIEWER" });
    await expect(createDraftFromText(v.ctx, { text: "BILL RAMESH 1 BOX 500", source: "TEXT" })).rejects.toMatchObject({ code: "READ_ONLY" });
    await expect(createCustomer(v.ctx, { name: "X Co", registrationStatus: "UNREGISTERED", stateCode: "27", billingAddress: "Somewhere 1" })).rejects.toMatchObject({ code: "READ_ONLY" });
  });
});
