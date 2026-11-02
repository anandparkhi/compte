import { computeGstinCheckChar } from "@/lib/domain/gstin";
import { prisma } from "@/server/db";
import type { Ctx } from "@/server/auth/ctx";
import { issueInvoice, setTodayForTests, updateDraft } from "@/server/services/invoices";
import { dateOnly } from "@/lib/domain/periods";

export const gstin = (first14: string) => first14 + computeGstinCheckChar(first14);
let counter = 0;

export async function makeBusiness(opts: { frequency?: "MONTHLY" | "QUARTERLY"; stateCode?: string; role?: Ctx["role"]; eInvoice?: boolean } = {}) {
  const n = ++counter;
  const state = opts.stateCode ?? "27";
  const user = await prisma.user.create({ data: { email: `u${n}-${Date.now()}@test.example`, name: `User ${n}`, passwordHash: "x" } });
  const business = await prisma.business.create({
    data: {
      legalName: `Test Biz ${n}`, gstin: gstin(`${state}ZZZTB${String(1000 + n).slice(-4)}Z1Z`), addressLine: "1 Test Road", city: "Pune", pincode: "411001", stateCode: state,
      contactPerson: "T", phone: `90000${String(10000 + n).slice(-5)}`, email: "t@test.example", filingFrequency: opts.frequency ?? "MONTHLY", financialYear: "2026-27",
      invoicePrefix: "TB", signatoryName: "Sig", eInvoiceMandatory: !!opts.eInvoice, phoneIsGstnRegistered: "DECLARED_YES",
    },
  });
  await prisma.authorizedBusinessUser.create({ data: { userId: user.id, businessId: business.id, role: opts.role ?? "OWNER" } });
  await prisma.invoiceNumberSequence.create({ data: { businessId: business.id, financialYear: "2026-27", prefix: "TB" } });
  const ctx: Ctx = { userId: user.id, userName: user.name, businessId: business.id, role: opts.role ?? "OWNER" };
  const ramesh = await prisma.customer.create({ data: { businessId: business.id, name: "Ramesh Traders", aliases: JSON.stringify(["Ramesh", "रमेश ट्रेडर्स", "रमेश"]), gstin: gstin(`27ZZZRT${String(1000 + n).slice(-4)}Z1Z`), stateCode: "27", billingAddress: "Pune", email: "r@test.example" } });
  const sai = await prisma.customer.create({ data: { businessId: business.id, name: "Sai Packaging Pvt Ltd", aliases: JSON.stringify(["Sai", "साई"]), gstin: gstin(`29ZZZSP${String(1000 + n).slice(-4)}Z1Z`), stateCode: "29", billingAddress: "Bengaluru" } });
  const box = await prisma.product.create({ data: { businessId: business.id, name: "Plastic Storage Box", aliases: JSON.stringify(["box", "बॉक्स", "डब्बा"]), hsnSac: "3923", unit: "BOX", defaultPrice: "500.00", gstRate: "18", taxSource: "USER_ENTERED" } });
  const tape = await prisma.product.create({ data: { businessId: business.id, name: "BOPP Packing Tape", aliases: JSON.stringify(["tape", "टेप"]), hsnSac: "3919", unit: "ROL", defaultPrice: "45.00", gstRate: "18" } });
  return { ctx, business, user, ramesh, sai, box, tape };
}

export type TB = Awaited<ReturnType<typeof makeBusiness>>;

/** Create + issue an invoice through the real services */
export async function issueFor(t: TB, date: string, customer: { id: string; stateCode: string }, lines: { productId: string; quantity: string; unitPrice: string; gstRate?: string; incl?: boolean }[], key = `k-${Math.random()}`) {
  const inv = await prisma.invoice.create({ data: { businessId: t.business.id, status: "DRAFT", invoiceDate: dateOnly(date), source: "MANUAL" } });
  const view = await updateDraft(t.ctx, inv.id, {
    customerId: customer.id, invoiceDate: date, placeOfSupplyStateCode: customer.stateCode, placeOfSupplyConfirmed: true,
    lines: lines.map((l) => ({ productId: l.productId, description: "Item", quantity: l.quantity, unitPrice: l.unitPrice, gstRate: l.gstRate ?? "18", priceIncludesTax: !!l.incl })),
  });
  const r = await issueInvoice(t.ctx, inv.id, { idempotencyKey: key, expectedGrandTotal: view.computation!.totals.grandTotal, confirm: true });
  return r.invoice;
}

export { setTodayForTests, prisma };
