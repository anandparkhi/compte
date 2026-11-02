import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Info } from "lucide-react";
import { requirePageContext } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { Card, Badge, PageHeader } from "@/components/ui";
import { formatINR } from "@/lib/domain/money";
import { parsePeriodKey, periodForDate } from "@/lib/domain/periods";

export const dynamic = "force-dynamic";

export default async function ImportedInvoicePage({params}:{params:Promise<{batch:string;index:string}>}){
 const ctx=await requirePageContext();
 const {batch,index}=await params;
 if(!/^(0|[1-9]\d{0,5})$/.test(index))notFound();
 const record=await prisma.gstHistoricalImport.findFirst({where:{id:batch,businessId:ctx.businessId}});
 if(!record)notFound();
 let data:{invoices?:{recipientGstin:string;number:string;date:string;value:number;taxable:number}[]};
 try{data=JSON.parse(record.records);}catch{notFound();}
 const row=data.invoices?.[Number(index)];
 if(!row||!row.number)notFound();
 const business=await prisma.business.findUniqueOrThrow({where:{id:ctx.businessId}});
 const monthly=parsePeriodKey(record.periodKey,"MONTHLY");
 const filing=periodForDate(monthly.start,business.filingFrequency as "MONTHLY"|"QUARTERLY");
 return <div className="mx-auto max-w-3xl space-y-5">
  <Link href={`/invoices?period=${record.periodKey}`} className="inline-flex items-center gap-2 text-sm font-semibold text-brand-700"><ArrowLeft className="size-4"/>Back to invoices</Link>
  <PageHeader title={row.number} subtitle="Historical invoice imported from GSTR-1" />
  <div className="flex flex-wrap gap-2"><Badge tone="info">Imported · read-only</Badge><Badge>GST portal filing unverified</Badge></div>
  <Card className="space-y-4">
   <div><p className="text-xs text-muted">Customer GSTIN</p><p className="mt-1 font-semibold">{row.recipientGstin}</p></div>
   <div className="grid grid-cols-2 gap-4"><div><p className="text-xs text-muted">Invoice date (from return)</p><p className="font-semibold">{row.date||"Not supplied"}</p></div><div><p className="text-xs text-muted">GSTR-1 period</p><p className="font-semibold">{monthly.label}</p></div></div>
   <div className="grid grid-cols-2 gap-4 border-t border-line pt-4"><div><p className="text-xs text-muted">Taxable amount</p><p className="text-xl font-bold">{formatINR(Number(row.taxable).toFixed(2))}</p></div><div><p className="text-xs text-muted">Invoice value as reported</p><p className="text-xl font-bold">{formatINR(Number(row.value).toFixed(2))}</p></div></div>
  </Card>
  <Card className="space-y-2"><h2 className="flex items-center gap-2 font-semibold"><Info className="size-4"/>What this record means</h2><p className="text-sm text-muted">This is historical evidence extracted from an uploaded GST return. Compte has not issued or verified this invoice, generated its original PDF, or confirmed payment. The difference between taxable and invoice values is not necessarily the exact GST amount.</p><p className="text-xs text-muted">Source: {record.sourceName} · Imported {record.createdAt.toLocaleDateString("en-IN")}</p><Link href={`/returns/${filing.key}`} className="inline-block text-sm font-semibold text-brand-700">View GST return period →</Link></Card>
 </div>;
}
