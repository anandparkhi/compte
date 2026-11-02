import "server-only";
import { prisma } from "../db";
import type { Ctx } from "../auth/ctx";
import { today } from "./invoices";
import { dateOnly, financialYearOf, parsePeriodKey, periodForDate, type FilingFrequency, type ReturnPeriod } from "@/lib/domain/periods";
import { sumMoney } from "@/lib/domain/money";

/** All figures come from the database — no fabricated metrics. */
export async function dashboard(ctx: Ctx, periodKey?: string) {
  const business = await prisma.business.findUniqueOrThrow({ where: { id: ctx.businessId } });
  const t = today();
  let period: ReturnPeriod;
  try { period = periodKey ? parsePeriodKey(periodKey, "MONTHLY") : periodForDate(t, "MONTHLY"); } catch { period = periodForDate(t, "MONTHLY"); }
  const range = { gte: dateOnly(period.start), lt: dateOnly(period.endExclusive) };
  const [issued, draftCount, recent, filings] = await Promise.all([
    prisma.invoice.findMany({ where: { businessId: ctx.businessId, status: "ISSUED", invoiceDate: range }, include: { customer: { select: { id: true, name: true } } } }),
    prisma.invoice.count({ where: { businessId: ctx.businessId, status: "DRAFT" } }),
    prisma.auditLog.findMany({ where: { businessId: ctx.businessId, action: { notIn: ["INVOICE_DRAFT_UPDATED", "USER_LOGGED_IN"] } }, orderBy: { createdAt: "desc" }, take: 8 }),
    prisma.nilReturnFiling.findMany({ where: { businessId: ctx.businessId }, orderBy: { updatedAt: "desc" }, take: 6 }),
  ]);
  const byCustomer = new Map<string, { name: string; count: number; totals: string[] }>();
  for (const i of issued) {
    const k = i.customer?.id ?? "-";
    const c = byCustomer.get(k) ?? { name: i.customer?.name ?? "—", count: 0, totals: [] };
    c.count++;
    c.totals.push(i.taxableTotal);
    byCustomer.set(k, c);
  }
  // most recent ended return period for the business's frequency
  const freq = business.filingFrequency as FilingFrequency;
  const current = periodForDate(t, freq);
  const prevKeyDate = new Date(`${current.start}T00:00:00Z`);
  prevKeyDate.setUTCDate(0); // last day of previous month
  const lastEnded = periodForDate(prevKeyDate.toISOString().slice(0, 10), freq);
  return {
    business,
    period,
    financialYear: financialYearOf(t),
    totals: {
      taxable: sumMoney(issued.map((i) => i.taxableTotal)),
      gst: sumMoney(issued.flatMap((i) => [i.cgstTotal, i.sgstTotal, i.igstTotal])),
      invoiceValue: sumMoney(issued.map((i) => i.grandTotal)),
      issuedCount: issued.length,
      draftCount,
    },
    customers: [...byCustomer.values()].map((c) => ({ name: c.name, count: c.count, taxable: sumMoney(c.totals) })).sort((a, b) => Number(b.taxable) - Number(a.taxable)).slice(0, 5),
    recent: recent.map((r) => ({ ...r, metadata: JSON.parse(r.metadata) as Record<string, unknown> })),
    filings,
    lastEndedPeriod: lastEnded,
  };
}
