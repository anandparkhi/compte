import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, ChevronDown, FileCheck2 } from "lucide-react";
import { requirePageContext } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { invoiceMonthKey } from "@/lib/gst-import/invoice-month";
import { ownerUiCopy } from "@/lib/i18n/owner-ui-copy";
import { formatINR } from "@/lib/domain/money";
import { parsePeriodKey, periodForDate } from "@/lib/domain/periods";

export const dynamic="force-dynamic";
export default async function ImportedInvoicePage({params}:{params:Promise<{batch:string;index:string}>}){
 const ctx=await requirePageContext();
 const {batch,index}=await params;
 if(!/^(0|[1-9]\d{0,5})$/.test(index))notFound();
 const record=await prisma.gstHistoricalImport.findFirst({where:{id:batch,businessId:ctx.businessId}});
 if(!record)notFound();
 let data:{invoices?:{recipientGstin:string;number:string;date:string;value:number;taxable:number}[]};
 try{data=JSON.parse(record.records);}catch{notFound();}
 const row=data.invoices?.[Number(index)];
 if(!row?.number)notFound();
 const business=await prisma.business.findUniqueOrThrow({where:{id:ctx.businessId}});
 const customer=await prisma.customer.findFirst({where:{businessId:ctx.businessId,gstin:row.recipientGstin},select:{name:true}});
 const u=ownerUiCopy(business.preferredLanguage);
 const monthKey=invoiceMonthKey(row.date,record.periodKey);
 const filing=periodForDate(parsePeriodKey(record.periodKey,"MONTHLY").start,business.filingFrequency as "MONTHLY"|"QUARTERLY");
 const name=customer?.name&&!customer.name.startsWith("Imported GSTIN ")?customer.name:u.customer;
 return <div className="mx-auto max-w-3xl space-y-5">
  <Link href={`/invoices?period=${monthKey}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700"><ArrowLeft className="size-4"/>{u.backToInvoices}</Link>
  <div><span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700"><FileCheck2 className="size-3.5"/>{u.imported} · {u.historicalBills}</span>
   <h1 className="mt-3 break-words text-3xl font-semibold tracking-[-.05em]">{row.number}</h1><p className="mt-1 text-sm text-muted">{row.date} · {name}</p>
  </div>
  <section className="rounded-[24px] border border-line bg-white p-5 sm:p-7">
    <p className="text-sm text-muted">{u.invoiceAmount}</p>
    <p className="tabular mt-1 text-[clamp(2rem,7vw,3.2rem)] font-semibold leading-tight tracking-[-.055em]">{formatINR(Number(row.value).toFixed(2))}</p>
    <div className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4"><div><p className="text-xs text-muted">{u.taxableAmount}</p><p className="tabular mt-1 text-lg font-semibold">{formatINR(Number(row.taxable).toFixed(2))}</p></div><div><p className="text-xs text-muted">{u.returnPeriod}</p><p className="mt-1 font-semibold">{filing.label}</p></div></div>
  </section>
  <section className="overflow-hidden rounded-2xl border border-line bg-white"><div className="px-4 py-3.5"><h2 className="font-semibold">{u.invoiceCustomer}</h2><p className="mt-1 text-sm">{name}</p><p className="mt-1 break-all text-xs text-muted">GSTIN: {row.recipientGstin}</p></div>
    <Link href={`/returns/${filing.key}`} className="flex items-center justify-between border-t border-line px-4 py-3.5 text-sm font-semibold text-brand-700">{u.goToReturn}<ArrowRight className="size-4"/></Link>
  </section>
  <details className="group overflow-hidden rounded-2xl border border-line bg-white"><summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3.5 font-medium">{u.reviewDetails}<ChevronDown className="size-4 text-muted group-open:rotate-180"/></summary><div className="space-y-3 border-t border-line px-4 py-4 text-sm leading-relaxed text-muted"><p>{u.originalRecord}</p><p><b>{u.sourceFile}:</b> <span className="break-all">{record.sourceName}</span></p><p>{record.createdAt.toLocaleDateString("en-IN")}</p></div></details>
 </div>;
}
