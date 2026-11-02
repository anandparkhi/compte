import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, ChevronDown, Download } from "lucide-react";
import { requirePageContext } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import { readHistorical, inReturnPeriod, historicalTotals } from "@/server/services/historical-records";
import { gstr1Preparation } from "@/server/services/returns";
import { ownerUiCopy } from "@/lib/i18n/owner-ui-copy";
import { formatINR } from "@/lib/domain/money";
import { formatDateIN } from "@/lib/domain/periods";

export const dynamic="force-dynamic";
export default async function PeriodPage({params}:{params:Promise<{period:string}>}){
 const ctx=await requirePageContext();
 const b=await prisma.business.findUniqueOrThrow({where:{id:ctx.businessId}});
 const u=ownerUiCopy(b.preferredLanguage);
 let prep;
 try{prep=await gstr1Preparation(ctx,(await params).period);}catch(e){if(e instanceof AppError&&e.status===422)notFound();throw e;}
 const history=await readHistorical(ctx.businessId);
 const imported=inReturnPeriod(history.invoices,prep.period);
 const sums=historicalTotals(imported);
 const hasImport=prep.period.months.some(m=>history.periods.includes(String(m.month).padStart(2,"0")+m.year));
 const issued=[...prep.b2b,...prep.b2cl,...prep.b2cs];
 const totalCount=sums.count+prep.documents.count;
 const taxable=Number(prep.totals.taxable)+sums.taxable;
 const invoiceValue=Number(prep.totals.invoiceValue)+sums.value;
 const historicalHsn=history.hsn.filter(h=>prep.period.months.some(m=>h.periodKey===String(m.month).padStart(2,"0")+m.year));
 const errors=prep.messages.filter(m=>m.severity==="ERROR");
 return <div className="mx-auto max-w-4xl space-y-5">
  <Link href="/returns" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700"><ArrowLeft className="size-4"/>{u.returnTitle}</Link>
  <div><p className="text-xs font-semibold uppercase tracking-[.12em] text-muted">GSTR-1 · {prep.period.key}</p><h1 className="mt-1 text-2xl font-semibold tracking-[-.045em] sm:text-3xl">{prep.period.label}</h1><p className="mt-1 text-sm text-muted">{hasImport?u.importedNotVerified:u.fileNotVerified}</p></div>
  {errors.length>0&&<div role="alert" className="rounded-xl border border-danger-50 bg-danger-50 p-3 text-sm text-danger-600">{errors.map((m,i)=><p key={i}>{m.text}</p>)}</div>}
  <section aria-label={u.periodSummary} className="overflow-hidden rounded-[24px] border border-line bg-white">
   <div className="p-5 sm:p-7"><p className="text-sm font-medium text-muted">{u.totalTaxable}</p><p className="tabular mt-1 text-[clamp(2rem,7vw,3.2rem)] font-semibold tracking-[-.055em] leading-tight">{formatINR(taxable.toFixed(2))}</p>
    <div className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4"><div><p className="text-xs text-muted">{u.invoiceValue}</p><p className="tabular mt-1 text-lg font-semibold">{formatINR(invoiceValue.toFixed(2))}</p></div><div><p className="text-xs text-muted">{u.invoices}</p><p className="tabular mt-1 text-lg font-semibold">{totalCount}</p><p className="text-xs text-muted">{sums.count} {u.importedLabel.toLowerCase()} · {prep.documents.count} {u.issuedLabel.toLowerCase()}</p></div></div>
   </div>
  </section>
  {totalCount>0?<section className="overflow-hidden rounded-[22px] border border-line bg-white">
   <div className="flex items-center justify-between px-4 py-3.5"><h2 className="font-semibold">{u.periodsWithData}</h2><span className="text-sm text-muted">{totalCount}</span></div>
   <ul className="divide-y divide-line border-t border-line">
    {imported.map(i=><li key={i.id}><Link href={`/invoices/imported/${i.id.replace(":","/")}`} className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-canvas"><div className="min-w-0"><p className="font-semibold">{i.number}</p><p className="mt-0.5 truncate text-xs text-muted">{i.date} · {i.recipientGstin}</p><p className="mt-0.5 text-[11px] text-brand-700">{u.historicalRecords}</p></div><b className="tabular shrink-0 text-sm">{formatINR(i.value.toFixed(2))}</b><ArrowRight className="size-4 shrink-0 text-muted"/></Link></li>)}
    {issued.map(i=><li key={i.id}><Link href={`/invoices/${i.id}`} className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-canvas"><div className="min-w-0"><p className="font-semibold">{i.invoiceNumber}</p><p className="mt-0.5 truncate text-xs text-muted">{formatDateIN(i.invoiceDate)} · {i.recipient.name}</p><p className="mt-0.5 text-[11px] text-brand-700">{u.newRecords}</p></div><b className="tabular shrink-0 text-sm">{formatINR(i.totals.grandTotal)}</b><ArrowRight className="size-4 shrink-0 text-muted"/></Link></li>)}
   </ul></section>:<div className="rounded-2xl border border-line bg-white p-5"><p className="font-semibold">{u.emptyPeriod}</p><p className="mt-1 text-sm text-muted">{u.emptyExplain}</p></div>}
  {prep.ended&&!hasImport&&prep.documents.count===0&&<Link href={`/returns/${prep.period.key}/nil`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700">Check nil return eligibility <ArrowRight className="size-4"/></Link>}
  {(historicalHsn.length>0||prep.hsnSummary.length>0)&&<details className="group overflow-hidden rounded-2xl border border-line bg-white">
    <summary className="flex cursor-pointer list-none items-center justify-between p-4 font-semibold">{u.hsnData} <ChevronDown className="size-4 text-muted group-open:rotate-180"/></summary>
    <div className="divide-y divide-line border-t border-line">
      {historicalHsn.map((h,i)=><div key={h.periodKey+":"+h.hsn+":"+i} className="flex justify-between gap-3 p-3 text-sm"><div><p className="font-medium">{h.hsn} · {h.description}</p><p className="text-xs text-muted">{u.imported}</p></div><b className="shrink-0">{formatINR(Number(h.taxable).toFixed(2))}</b></div>)}
      {prep.hsnSummary.map((h,i)=><div key={h.hsnSac+":"+i} className="flex justify-between gap-3 p-3 text-sm"><div><p className="font-medium">{h.hsnSac} · {h.rate}%</p><p className="text-xs text-muted">{u.newRecords}</p></div><b className="shrink-0">{formatINR(h.taxable)}</b></div>)}
    </div>
  </details>}
  <details className="group overflow-hidden rounded-2xl border border-line bg-white"><summary className="flex cursor-pointer list-none items-center justify-between p-4 font-semibold">{u.filingNotes}<ChevronDown className="size-4 text-muted group-open:rotate-180"/></summary>
   <div className="space-y-3 border-t border-line p-4 text-sm leading-relaxed text-muted">
    {hasImport&&<p>{u.importedWarning}</p>}
    <p>{u.exportWarning}</p>
    {prep.documents.count>0&&<><p>{u.taxBreakdown}: {formatINR((Number(prep.totals.cgst)+Number(prep.totals.sgst)+Number(prep.totals.igst)).toFixed(2))} ({u.newRecords})</p><Link href={`/api/returns/${prep.period.key}/gstr1-export`} className="inline-flex items-center gap-2 rounded-xl border border-line px-3 py-2 font-semibold text-brand-700"><Download className="size-4"/>Download working file</Link></>}
   </div></details>
 </div>;
}
