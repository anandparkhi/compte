import "server-only";
import { prisma } from "../db";
import { AppError } from "../errors";
import { audit } from "../audit";
import type { Ctx } from "../auth/ctx";
import { today } from "./invoices";
import { dec, money, sumMoney } from "@/lib/domain/money";
import { dateOnly, formatDateIN, isPeriodEnded, listPeriodsForFY, parsePeriodKey, PeriodError, toDateString, type FilingFrequency, type ReturnPeriod } from "@/lib/domain/periods";
import { validateGstin } from "@/lib/domain/gstin";
import type { InvoiceSnapshot } from "./invoices";

/**
 * GSTR-1 preparation from ISSUED invoices only (drafts are never reported).
 * Export is a clearly labelled COMPTE INTERNAL DRAFT: the official GSTN offline-tool schema
 * could not be retrieved and validated, so the file is NOT portal-upload-ready.
 */
export const B2CL_THRESHOLD = "100000"; // inter-state B2C invoices above ₹1 lakh (verify before production)

function period(ctx: { frequency: FilingFrequency }, key: string): ReturnPeriod {
  try { return parsePeriodKey(key, ctx.frequency); } catch (e) {
    if (e instanceof PeriodError) throw new AppError(422, "INVALID_PERIOD", e.message);
    throw e;
  }
}

export async function periodSummaries(ctx: Ctx, fy: string) {
  const business = await prisma.business.findUniqueOrThrow({ where: { id: ctx.businessId } });
  const freq = business.filingFrequency as FilingFrequency;
  const periods = listPeriodsForFY(fy, freq);
  const t = today();
  const [invoices, filings, inward] = await Promise.all([
    prisma.invoice.findMany({ where: { businessId: ctx.businessId, status: { in: ["ISSUED", "DRAFT"] } }, select: { status: true, invoiceDate: true, taxableTotal: true, cgstTotal: true, sgstTotal: true, igstTotal: true } }),
    prisma.nilReturnFiling.findMany({ where: { businessId: ctx.businessId } }),
    prisma.inwardSupply.findMany({ where: { businessId: ctx.businessId }, select: { documentDate: true } }),
  ]);
  return periods.map((p) => {
    const inP = (d: Date) => { const s = toDateString(d); return s >= p.start && s < p.endExclusive; };
    const issued = invoices.filter((i) => i.status === "ISSUED" && inP(i.invoiceDate));
    const drafts = invoices.filter((i) => i.status === "DRAFT" && inP(i.invoiceDate)).length;
    const f = (rt: string) => filings.filter((x) => x.returnType === rt && x.periodKey === p.key).sort((a, b) => (a.isDemo === b.isDemo ? 0 : a.isDemo ? 1 : -1))[0] ?? null;
    return {
      period: p,
      ended: isPeriodEnded(p, t),
      issuedCount: issued.length,
      draftCount: drafts,
      purchaseCount: inward.filter((x) => inP(x.documentDate)).length,
      taxable: sumMoney(issued.map((i) => i.taxableTotal)),
      tax: sumMoney(issued.flatMap((i) => [i.cgstTotal, i.sgstTotal, i.igstTotal])),
      nilGstr1: f("GSTR1"),
      nilGstr3b: f("GSTR3B"),
    };
  });
}

export async function gstr1Preparation(ctx: Ctx, periodKey: string) {
  const business = await prisma.business.findUniqueOrThrow({ where: { id: ctx.businessId } });
  const p = period({ frequency: business.filingFrequency as FilingFrequency }, periodKey);
  const invoices = await prisma.invoice.findMany({
    where: { businessId: ctx.businessId, status: "ISSUED", invoiceDate: { gte: dateOnly(p.start), lt: dateOnly(p.endExclusive) } },
    orderBy: [{ invoiceDate: "asc" }, { invoiceNumber: "asc" }],
  });
  const drafts = await prisma.invoice.count({ where: { businessId: ctx.businessId, status: "DRAFT", invoiceDate: { gte: dateOnly(p.start), lt: dateOnly(p.endExclusive) } } });
  const snaps = invoices.map((i) => ({ id: i.id, s: JSON.parse(i.snapshot!) as InvoiceSnapshot }));
  const messages: { severity: "ERROR" | "WARNING" | "INFO"; text: string }[] = [];

  const b2b = snaps.filter(({ s }) => s.recipient.registrationStatus === "REGISTERED" && s.recipient.gstin);
  const b2c = snaps.filter(({ s }) => !(s.recipient.registrationStatus === "REGISTERED" && s.recipient.gstin));
  const b2cl = b2c.filter(({ s }) => s.supplyType === "INTER" && dec(s.totals.grandTotal).gt(B2CL_THRESHOLD));
  const b2cs = b2c.filter((x) => !b2cl.includes(x));

  for (const { s } of b2b) if (!validateGstin(s.recipient.gstin!).valid) messages.push({ severity: "ERROR", text: `${s.invoiceNumber}: recipient GSTIN ${s.recipient.gstin} fails structural validation.` });
  if (drafts) messages.push({ severity: "WARNING", text: `${drafts} draft invoice(s) are dated in this period. Drafts are not reported — issue or discard them.` });
  if (b2c.length) messages.push({ severity: "INFO", text: `${b2c.length} B2C invoice(s) are summarised (B2CL/B2CS). Compte's B2C summary has not been verified against the GSTN schema.` });
  if (!invoices.length) messages.push({ severity: "INFO", text: "No issued invoices in this period. If the business had no outward supplies at all, consider the Nil Return flow instead." });

  // HSN summary (by HSN + rate + unit)
  const hsn = new Map<string, { hsnSac: string; unit: string; rate: string; qty: string; taxable: string; cgst: string; sgst: string; igst: string; b2b: boolean }>();
  for (const { s } of snaps) for (const l of s.lines) {
    const isB2b = s.recipient.registrationStatus === "REGISTERED";
    const k = `${isB2b ? "B2B" : "B2C"}|${l.hsnSac}|${l.gstRate}|${l.unit}`;
    const cur = hsn.get(k) ?? { hsnSac: l.hsnSac, unit: l.unit, rate: l.gstRate, qty: "0", taxable: "0.00", cgst: "0.00", sgst: "0.00", igst: "0.00", b2b: isB2b };
    hsn.set(k, { ...cur, qty: dec(cur.qty).plus(l.quantity).toString(), taxable: money(dec(cur.taxable).plus(l.taxableValue)), cgst: money(dec(cur.cgst).plus(l.cgst)), sgst: money(dec(cur.sgst).plus(l.sgst)), igst: money(dec(cur.igst).plus(l.igst)) });
  }
  const nums = snaps.map(({ s }) => s.invoiceNumber).sort();
  const totals = {
    taxable: sumMoney(snaps.map(({ s }) => s.totals.taxableTotal)),
    cgst: sumMoney(snaps.map(({ s }) => s.totals.cgstTotal)),
    sgst: sumMoney(snaps.map(({ s }) => s.totals.sgstTotal)),
    igst: sumMoney(snaps.map(({ s }) => s.totals.igstTotal)),
    invoiceValue: sumMoney(snaps.map(({ s }) => s.totals.grandTotal)),
  };
  await prisma.returnBatch.upsert({
    where: { businessId_returnType_periodKey: { businessId: ctx.businessId, returnType: "GSTR1", periodKey: p.key } },
    create: { businessId: ctx.businessId, returnType: "GSTR1", financialYear: p.financialYear, periodKey: p.key, periodType: p.frequency, invoiceCount: snaps.length, taxableTotal: totals.taxable, taxTotal: sumMoney([totals.cgst, totals.sgst, totals.igst]) },
    update: { invoiceCount: snaps.length, taxableTotal: totals.taxable, taxTotal: sumMoney([totals.cgst, totals.sgst, totals.igst]) },
  });
  return {
    business: { gstin: business.gstin, legalName: business.legalName },
    period: p,
    ended: isPeriodEnded(p, today()),
    b2b: b2b.map(({ id, s }) => ({ id, ...s })),
    b2cl: b2cl.map(({ id, s }) => ({ id, ...s })),
    b2cs: b2cs.map(({ id, s }) => ({ id, ...s })),
    hsnSummary: [...hsn.values()],
    documents: { count: nums.length, from: nums[0] ?? null, to: nums[nums.length - 1] ?? null },
    totals,
    messages,
    draftCount: drafts,
  };
}

export async function exportGstr1InternalDraft(ctx: Ctx, periodKey: string) {
  const prep = await gstr1Preparation(ctx, periodKey);
  const b2bByCtin = new Map<string, typeof prep.b2b>();
  for (const inv of prep.b2b) b2bByCtin.set(inv.recipient.gstin!, [...(b2bByCtin.get(inv.recipient.gstin!) ?? []), inv]);
  const json = {
    _compte: {
      kind: "COMPTE_INTERNAL_DRAFT",
      portalUploadReady: false,
      schemaVerified: false,
      notice: "Internal working draft generated by Compte. Field layout is modelled on the public GSTR-1 offline-tool format but has NOT been validated against the current official GSTN schema. Do not upload to the GST portal. Review with your accountant.",
      generatedAt: new Date().toISOString(),
      periodLabel: prep.period.label,
    },
    gstin: prep.business.gstin,
    fp: prep.period.key,
    b2b: [...b2bByCtin.entries()].map(([ctin, invs]) => ({
      ctin,
      inv: invs.map((inv) => ({
        inum: inv.invoiceNumber,
        idt: formatDateIN(inv.invoiceDate),
        val: Number(inv.totals.grandTotal),
        pos: inv.placeOfSupply.stateCode,
        rchrg: "N",
        inv_typ: "R",
        itms: groupByRate(inv.lines).map((g, i) => ({ num: i + 1, itm_det: { txval: Number(g.taxable), rt: Number(g.rate), iamt: Number(g.igst), camt: Number(g.cgst), samt: Number(g.sgst), csamt: 0 } })),
      })),
    })),
    b2cl: prep.b2cl.map((inv) => ({ pos: inv.placeOfSupply.stateCode, inv: [{ inum: inv.invoiceNumber, idt: formatDateIN(inv.invoiceDate), val: Number(inv.totals.grandTotal), itms: groupByRate(inv.lines).map((g, i) => ({ num: i + 1, itm_det: { txval: Number(g.taxable), rt: Number(g.rate), iamt: Number(g.igst), csamt: 0 } })) }] })),
    b2cs: summariseB2cs(prep.b2cs),
    hsn: { data: prep.hsnSummary.map((h, i) => ({ num: i + 1, hsn_sc: h.hsnSac, uqc: h.unit, qty: Number(h.qty), rt: Number(h.rate), txval: Number(h.taxable), iamt: Number(h.igst), camt: Number(h.cgst), samt: Number(h.sgst), csamt: 0, _compte_section: h.b2b ? "B2B" : "B2C" })) },
    doc_issue: { doc_det: prep.documents.count ? [{ doc_num: 1, docs: [{ num: 1, from: prep.documents.from, to: prep.documents.to, totnum: prep.documents.count, cancel: 0, net_issue: prep.documents.count }] }] : [] },
  };
  await prisma.returnBatch.update({
    where: { businessId_returnType_periodKey: { businessId: ctx.businessId, returnType: "GSTR1", periodKey: prep.period.key } },
    data: { status: "INTERNAL_DRAFT_EXPORTED", exportKind: "COMPTE_INTERNAL_DRAFT", exportedAt: new Date() },
  });
  await audit({ businessId: ctx.businessId, userId: ctx.userId, action: "GSTR1_INTERNAL_DRAFT_EXPORTED", entityType: "ReturnBatch", metadata: { periodKey: prep.period.key, invoices: prep.documents.count } });
  return { filename: `COMPTE-INTERNAL-DRAFT_GSTR1_${prep.business.gstin}_${prep.period.key}.json`, json };
}

function groupByRate(lines: InvoiceSnapshot["lines"]) {
  const m = new Map<string, { rate: string; taxable: string; cgst: string; sgst: string; igst: string }>();
  for (const l of lines) {
    const c = m.get(l.gstRate) ?? { rate: l.gstRate, taxable: "0", cgst: "0", sgst: "0", igst: "0" };
    m.set(l.gstRate, { rate: l.gstRate, taxable: money(dec(c.taxable).plus(l.taxableValue)), cgst: money(dec(c.cgst).plus(l.cgst)), sgst: money(dec(c.sgst).plus(l.sgst)), igst: money(dec(c.igst).plus(l.igst)) });
  }
  return [...m.values()];
}

function summariseB2cs(invs: (InvoiceSnapshot & { id: string })[]) {
  const m = new Map<string, { sply_ty: string; pos: string; rt: number; txval: string; iamt: string; camt: string; samt: string }>();
  for (const inv of invs) for (const g of groupByRate(inv.lines)) {
    const k = `${inv.supplyType}|${inv.placeOfSupply.stateCode}|${g.rate}`;
    const c = m.get(k) ?? { sply_ty: inv.supplyType, pos: inv.placeOfSupply.stateCode, rt: Number(g.rate), txval: "0", iamt: "0", camt: "0", samt: "0" };
    m.set(k, { ...c, txval: money(dec(c.txval).plus(g.taxable)), iamt: money(dec(c.iamt).plus(g.igst)), camt: money(dec(c.camt).plus(g.cgst)), samt: money(dec(c.samt).plus(g.sgst)) });
  }
  return [...m.values()].map((v) => ({ ...v, typ: "OE", txval: Number(v.txval), iamt: Number(v.iamt), camt: Number(v.camt), samt: Number(v.samt), csamt: 0 }));
}
