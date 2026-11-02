import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { requirePageContext } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import { readHistorical,inReturnPeriod,historicalTotals } from "@/server/services/historical-records";
import { gstr1Preparation } from "@/server/services/returns";
import { getT } from "@/lib/i18n/server";
import { Alert, Card, CardTitle, Empty, LinkButton, PageHeader } from "@/components/ui";
import { formatINR } from "@/lib/domain/money";
import { formatDateIN } from "@/lib/domain/periods";

export const dynamic = "force-dynamic";
export default async function PeriodPage({ params }: { params: Promise<{ period: string }> }) {
  const ctx = await requirePageContext();
  const b = await prisma.business.findUniqueOrThrow({ where: { id: ctx.businessId } });
  const { t } = await getT(b.preferredLanguage);
  let prep;
  try { prep = await gstr1Preparation(ctx, (await params).period); } catch (e) { if (e instanceof AppError && e.status === 422) notFound(); throw e; }
  const all = [...prep.b2b, ...prep.b2cl, ...prep.b2cs];
  const historic = await readHistorical(ctx.businessId);
  const imported = inReturnPeriod(historic.invoices,prep.period);
  const totals = historicalTotals(imported);
  const hasImport = prep.period.months.some(m => historic.periods.includes(String(m.month).padStart(2,"0")+m.year));
  const combinedCount = prep.documents.count + totals.count;
  const combinedTaxable = (Number(prep.totals.taxable) + totals.taxable).toFixed(2);
  const historicalHsn = historic.hsn.filter(h=>prep.period.months.some(m=>h.periodKey===String(m.month).padStart(2,"0")+m.year));
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader title={`GSTR-1 — ${prep.period.label}`} subtitle={`GST period ${prep.period.key} · reported history and new Compte invoices`}
        actions={<>
          {prep.ended && !hasImport && prep.documents.count===0 && <LinkButton href={`/returns/${prep.period.key}/nil`} variant="outline">Check nil eligibility</LinkButton>}
          {prep.documents.count>0 && <LinkButton href={`/api/returns/${prep.period.key}/gstr1-export`} prefetch={false}><Download className="size-4" />Export only new Compte invoices</LinkButton>}
        </>} />
      {hasImport && <Alert tone="info" title="Historical GSTR-1 data imported">Imported sales are shown below. GSTN filing status is not verified; these records are not added to a new return or treated as newly issued invoices.</Alert>}
      <Alert tone="warn" title="Compte exports are not portal upload-ready">The export is a Compte working file modelled on the GSTR-1 offline-tool layout. It has not been validated against the current official GSTN schema, so do not upload it to the GST portal. Filing a non-nil GSTR-1 is done on the portal or by your accountant.</Alert>
      {prep.messages.filter(m=>!(hasImport&&m.text.includes("No issued invoices"))).map((m, i) => <Alert key={i} tone={m.severity === "ERROR" ? "danger" : m.severity === "WARNING" ? "warn" : "info"}>{m.text}</Alert>)}
      <div className="tabular grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="p-4"><p className="text-xs text-muted">Invoices recorded</p><p className="text-xl font-bold">{combinedCount}</p><p className="text-xs text-muted">{totals.count} imported · {prep.documents.count} new</p></Card>
        <Card className="p-4"><p className="text-xs text-muted">Recorded taxable sales</p><p className="text-xl font-bold">{formatINR(combinedTaxable)}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted">Invoice value</p><p className="text-xl font-bold">{formatINR((Number(prep.totals.invoiceValue)+totals.value).toFixed(2))}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted">GST on new invoices only</p><p className="text-xl font-bold">{prep.documents.count?formatINR((Number(prep.totals.cgst)+Number(prep.totals.sgst)+Number(prep.totals.igst)).toFixed(2)):"—"}</p></Card>
      </div>
      {hasImport && <Card>
        <CardTitle>Historical GSTR-1 import (read-only)</CardTitle>
        <p className="mt-2 text-sm">{totals.count} imported B2B invoices · {formatINR(totals.taxable.toFixed(2))} taxable · {formatINR(totals.value.toFixed(2))} invoice value</p>
        <p className="text-xs text-muted">Imported return data, not independently verified as filed. Excluded from Compte's new GSTR-1 export to avoid double counting.</p>
        <ul className="mt-3 divide-y divide-line">{imported.map(i=><li className="flex justify-between gap-2 py-2 text-sm" key={i.id}><Link className="font-semibold text-brand-700" href={`/invoices/imported/${i.id.replace(":","/")}`}>{i.number} · {i.recipientGstin} · {i.date}</Link><b>{formatINR(i.value.toFixed(2))}</b></li>)}</ul>
      </Card>}
      <Card className="overflow-x-auto p-0">
        <CardTitle className="px-4 pt-4">New invoices issued through Compte (B2B {prep.b2b.length} · B2CL {prep.b2cl.length} · B2CS {prep.b2cs.length})</CardTitle>
        {all.length ? (
          <table className="mt-2 w-full min-w-[640px] text-sm">
            <thead className="bg-canvas text-left text-xs uppercase text-muted"><tr><th className="px-4 py-2">Invoice</th><th className="px-2 py-2">Recipient</th><th className="px-2 py-2">POS</th><th className="px-2 py-2 text-right">Taxable</th><th className="px-2 py-2 text-right">Tax</th><th className="px-4 py-2 text-right">Value</th></tr></thead>
            <tbody className="tabular divide-y divide-line">
              {all.map((i) => (
                <tr key={i.id}>
                  <td className="px-4 py-2"><Link className="font-mono font-semibold text-brand-700" href={`/invoices/${i.id}`}>{i.invoiceNumber}</Link><br /><span className="text-xs text-muted">{formatDateIN(i.invoiceDate)}</span></td>
                  <td className="px-2 py-2">{i.recipient.name}<br /><span className="font-mono text-xs text-muted">{i.recipient.gstin ?? "Unregistered"}</span></td>
                  <td className="px-2 py-2">{i.placeOfSupply.stateCode}</td>
                  <td className="px-2 py-2 text-right">{formatINR(i.totals.taxableTotal)}</td>
                  <td className="px-2 py-2 text-right">{formatINR((Number(i.totals.cgstTotal) + Number(i.totals.sgstTotal) + Number(i.totals.igstTotal)).toFixed(2))}</td>
                  <td className="px-4 py-2 text-right font-semibold">{formatINR(i.totals.grandTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <div className="p-4"><Empty>No new invoices issued in Compte this period. Imported invoices are listed above.</Empty></div>}
      </Card>
      {historicalHsn.length>0 && <Card className="space-y-2"><CardTitle>HSN/SAC from imported returns</CardTitle><p className="text-xs text-muted">These are historical HSN summaries, not verified product prices or current GST rates.</p><ul className="divide-y divide-line">{historicalHsn.map((h,i)=><li key={h.periodKey+":"+h.hsn+":"+i} className="flex justify-between gap-3 py-2 text-sm"><span><b>{h.hsn}</b> {h.description}</span><span>{formatINR(Number(h.taxable).toFixed(2))} taxable</span></li>)}</ul></Card>}
      <Card className="overflow-x-auto p-0">
        <CardTitle className="px-4 pt-4">HSN/SAC on new Compte invoices</CardTitle>
        {prep.hsnSummary.length ? (
          <table className="mt-2 w-full min-w-[560px] text-sm">
            <thead className="bg-canvas text-left text-xs uppercase text-muted"><tr><th className="px-4 py-2">HSN/SAC</th><th className="px-2 py-2">Section</th><th className="px-2 py-2 text-right">Qty</th><th className="px-2 py-2 text-right">Rate</th><th className="px-2 py-2 text-right">Taxable</th><th className="px-4 py-2 text-right">Tax</th></tr></thead>
            <tbody className="tabular divide-y divide-line">
              {prep.hsnSummary.map((h, i) => <tr key={i}><td className="px-4 py-2 font-mono">{h.hsnSac}</td><td className="px-2 py-2">{h.b2b ? "B2B" : "B2C"}</td><td className="px-2 py-2 text-right">{h.qty} {h.unit}</td><td className="px-2 py-2 text-right">{h.rate}%</td><td className="px-2 py-2 text-right">{formatINR(h.taxable)}</td><td className="px-4 py-2 text-right">{formatINR((Number(h.cgst) + Number(h.sgst) + Number(h.igst)).toFixed(2))}</td></tr>)}
            </tbody>
          </table>
        ) : <div className="p-4"><Empty>Nothing to summarise.</Empty></div>}
        {prep.documents.count > 0 && <p className="px-4 py-3 text-xs text-muted">Documents issued: {prep.documents.from} → {prep.documents.to} ({prep.documents.count}, none cancelled)</p>}
      </Card>
    </div>
  );
}
