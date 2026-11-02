/**
 * Demo seed — ALL DATA IS FICTIONAL. GSTINs use the clearly fake PAN series "ZZZ..." and pass the
 * structural checksum only so validation can be demonstrated. Never file anything with them.
 *
 * Scenarios (FY 2026-27, monthly filer):
 *   Apr, Jun, Jul, Aug, Oct 2026 — issued invoices (Aug blocks nil GSTR-1)
 *   May 2026 — no sales but purchases recorded (nil GSTR-1 possible, nil GSTR-3B blocked)
 *   Sep 2026 — no activity at all (eligible-looking nil period)
 *   1 Nov 2026 — one draft invoice (customer ships to Goa: POS ≠ billing state)
 *
 * Run: npm run db:seed   (uses --conditions=react-server so server modules load outside Next)
 */
import { computeGstinCheckChar } from "../src/lib/domain/gstin";
import { prisma } from "../src/server/db";
import { hashPassword } from "../src/server/auth/password";
import { issueInvoice, setTodayForTests, updateDraft } from "../src/server/services/invoices";
import { dateOnly } from "../src/lib/domain/periods";
import type { Ctx } from "../src/server/auth/ctx";

export const DEMO = { email: "demo@compte.example", password: "compte-demo-2026" };
const g = (first14: string) => first14 + computeGstinCheckChar(first14);
export const DEMO_GSTIN = g("27ZZZFZ0001Z1Z");

async function main() {
  const existing = await prisma.business.findUnique({ where: { gstin: DEMO_GSTIN } });
  if (existing) {
    console.log("Demo data already present — run `npm run db:reset` to recreate.");
    return;
  }
  const user = await prisma.user.create({ data: { email: DEMO.email, name: "Anita Deshmukh (demo)", passwordHash: hashPassword(DEMO.password) } });
  const business = await prisma.business.create({
    data: {
      legalName: "Demo Maharashtra Traders (Fictional)", tradeName: "DMT Packaging", gstin: DEMO_GSTIN,
      addressLine: "Unit 12, Fictional Industrial Estate, Bhosari", city: "Pune", pincode: "411026", stateCode: "27",
      contactPerson: "Anita Deshmukh", phone: "9000000001", email: "accounts@dmt.example",
      registrationType: "REGULAR", filingFrequency: "MONTHLY", financialYear: "2026-27", eInvoiceMandatory: false,
      preferredLanguage: "en", invoicePrefix: "DMT", signatoryName: "Anita Deshmukh", signatoryDesignation: "Proprietor",
      phoneIsGstnRegistered: "DECLARED_YES", phoneDeclarationAt: new Date(), isDemo: true,
    },
  });
  await prisma.authorizedBusinessUser.create({ data: { userId: user.id, businessId: business.id, role: "OWNER" } });
  await prisma.invoiceNumberSequence.create({ data: { businessId: business.id, financialYear: "2026-27", prefix: "DMT", nextNumber: 1 } });
  const ctx: Ctx = { userId: user.id, userName: user.name, businessId: business.id, role: "OWNER" };

  const cust = async (d: { name: string; aliases: string[]; gstin: string; stateCode: string; billingAddress: string; shippingAddress?: string; shippingStateCode?: string; email: string; phone: string }) =>
    prisma.customer.create({ data: { businessId: business.id, registrationStatus: "REGISTERED", ...d, aliases: JSON.stringify(d.aliases), shippingAddress: d.shippingAddress ?? null, shippingStateCode: d.shippingStateCode ?? null } });
  const ramesh = await cust({ name: "Ramesh Traders", aliases: ["Ramesh", "रमेश ट्रेडर्स", "रमेश"], gstin: g("27ZZZRT1234Z1Z"), stateCode: "27", billingAddress: "45 Fictional Market Yard, Gultekdi, Pune 411037", email: "ramesh@ramesh-traders.example", phone: "9000000002" });
  const sai = await cust({ name: "Sai Packaging Pvt Ltd", aliases: ["Sai", "Sai Packaging", "साई पॅकेजिंग", "साई"], gstin: g("29ZZZSP5678Z1Z"), stateCode: "29", billingAddress: "8 Fictional Layout, Peenya, Bengaluru 560058", email: "purchase@saipack.example", phone: "9000000003" });
  const kaveri = await cust({ name: "Kaveri Foods", aliases: ["Kaveri", "कावेरी फूड्स", "कावेरी"], gstin: g("27ZZZKF4321Z1Z"), stateCode: "27", billingAddress: "3 Fictional MIDC Road, Satpur, Nashik 422007", shippingAddress: "Warehouse 2, Fictional Estate, Verna, Goa 403722", shippingStateCode: "30", email: "ops@kaveri.example", phone: "9000000004" });

  const prod = (d: { name: string; aliases: string[]; kind: string; hsnSac: string; unit: string; defaultPrice: string; gstRate: string; description: string }) =>
    prisma.product.create({ data: { businessId: business.id, ...d, aliases: JSON.stringify(d.aliases), priceIncludesTax: false, taxSource: "DEMO_SEED", taxConfirmedAt: new Date() } });
  const box = await prod({ name: "Plastic Storage Box", aliases: ["box", "boxes", "बॉक्स", "डब्बा", "खोका"], kind: "GOODS", hsnSac: "3923", unit: "BOX", defaultPrice: "500.00", gstRate: "18", description: "Demo configuration — verify HSN/rate before real use" });
  const tape = await prod({ name: "BOPP Packing Tape", aliases: ["tape", "टेप"], kind: "GOODS", hsnSac: "3919", unit: "ROL", defaultPrice: "45.00", gstRate: "18", description: "Demo configuration — verify HSN/rate before real use" });
  const film = await prod({ name: "Stretch Wrap Film", aliases: ["film", "wrap", "फिल्म", "रॅप"], kind: "GOODS", hsnSac: "3920", unit: "KGS", defaultPrice: "180.00", gstRate: "18", description: "Demo configuration — verify HSN/rate before real use" });
  const design = await prod({ name: "Packaging Design Service", aliases: ["design", "डिझाइन", "डिज़ाइन"], kind: "SERVICES", hsnSac: "998391", unit: "HRS", defaultPrice: "1200.00", gstRate: "18", description: "Demo configuration — verify SAC/rate before real use" });
  const packing = await prod({ name: "Packing Labour Service", aliases: ["packing", "पॅकिंग", "पैकिंग"], kind: "SERVICES", hsnSac: "998540", unit: "HRS", defaultPrice: "350.00", gstRate: "18", description: "Demo configuration — verify SAC/rate before real use" });

  type L = { p: { id: string; name: string; gstRate: string }; q: string; price: string };
  let n = 0;
  const issue = async (date: string, customer: { id: string; stateCode: string; shippingStateCode: string | null }, lines: L[]) => {
    const inv = await prisma.invoice.create({ data: { businessId: business.id, status: "DRAFT", invoiceDate: dateOnly(date), source: "MANUAL", extractionMethod: "MANUAL", createdByUserId: user.id } });
    const view = await updateDraft(ctx, inv.id, {
      customerId: customer.id, invoiceDate: date, placeOfSupplyStateCode: customer.shippingStateCode ?? customer.stateCode, placeOfSupplyConfirmed: true,
      lines: lines.map((l) => ({ productId: l.p.id, description: l.p.name, quantity: l.q, unitPrice: l.price, gstRate: l.p.gstRate, priceIncludesTax: false })),
    });
    await issueInvoice(ctx, inv.id, { idempotencyKey: `seed-${++n}-${inv.id}`, expectedGrandTotal: view.computation!.totals.grandTotal, confirm: true });
  };

  setTodayForTests(() => "2026-11-01");
  await issue("2026-04-18", ramesh, [{ p: box, q: "10", price: "480.00" }]);
  await issue("2026-06-05", ramesh, [{ p: box, q: "25", price: "500.00" }, { p: tape, q: "40", price: "45.00" }]);
  await issue("2026-06-21", sai, [{ p: film, q: "60", price: "175.00" }]);
  await issue("2026-07-09", kaveri, [{ p: box, q: "15", price: "520.00" }]);
  await issue("2026-07-27", ramesh, [{ p: packing, q: "12", price: "350.00" }]);
  await issue("2026-08-12", sai, [{ p: design, q: "8", price: "1200.00" }]);
  await issue("2026-08-30", ramesh, [{ p: box, q: "30", price: "495.00" }, { p: tape, q: "50", price: "44.00" }]);
  await issue("2026-10-06", ramesh, [{ p: box, q: "18", price: "500.00" }]);
  await issue("2026-10-17", sai, [{ p: tape, q: "120", price: "42.50" }, { p: film, q: "25", price: "180.00" }]);
  await issue("2026-10-29", kaveri, [{ p: box, q: "12", price: "510.00" }]);
  setTodayForTests(null);

  // May 2026: no sales, but purchases recorded -> nil GSTR-3B must be blocked
  await prisma.inwardSupply.createMany({
    data: [
      { businessId: business.id, supplierName: "Fictional Polymers Ltd", supplierGstin: g("27ZZZFP9999Z1Z"), documentNumber: "FP/26-27/0412", documentDate: dateOnly("2026-05-14"), taxableValue: "42000.00", taxAmount: "7560.00", source: "DEMO_SEED" },
      { businessId: business.id, supplierName: "Fictional Freight Co", supplierGstin: null, documentNumber: "FFC-118", documentDate: dateOnly("2026-05-22"), taxableValue: "6000.00", taxAmount: "300.00", reverseCharge: true, source: "DEMO_SEED" },
    ],
  });

  // Draft dated 1 Nov 2026: customer billed in Nashik but goods delivered to Goa
  await prisma.invoice.create({
    data: {
      businessId: business.id, status: "DRAFT", invoiceDate: dateOnly("2026-11-01"), customerId: kaveri.id, placeOfSupplyStateCode: "30", placeOfSupplySource: "AUTO_SUGGESTED",
      source: "TEXT", sourceText: "Kaveri Foods ko 8 box 510 rupaye, GST extra", sourceLanguage: "mixed", extractionMethod: "RULES",
      extractionNotes: JSON.stringify(["Place of supply suggested as Goa (delivery address) — confirm it."]), createdByUserId: user.id,
      lineItems: { create: [{ position: 1, productId: box.id, description: box.name, hsnSac: box.hsnSac, unit: box.unit, quantity: "8", unitPrice: "510.00", gstRate: "18", priceIncludesTax: false }] },
    },
  });

  console.log(`Seeded demo business ${business.legalName} (${DEMO_GSTIN})`);
  console.log(`Login: ${DEMO.email} / ${DEMO.password}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
