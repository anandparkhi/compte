import Link from "next/link";
import { ArrowRight, ChevronDown, FileUp, Plus, ReceiptText } from "lucide-react";
import { requirePageContext } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { readHistorical, inReturnPeriod, historicalTotals } from "@/server/services/historical-records";
import { dashboard } from "@/server/services/dashboard";
import { ownerCopy } from "@/lib/i18n/owner-copy";
import { ownerUiCopy } from "@/lib/i18n/owner-ui-copy";
import { formatINR } from "@/lib/domain/money";
import { parsePeriodKey, periodKeyFor } from "@/lib/domain/periods";

export const dynamic = "force-dynamic";
const order = (key:string)=>Number(key.slice(2))*12+Number(key.slice(0,2));
const safePeriod=(key?:string)=>{try{if(key){parsePeriodKey(key,"MONTHLY");return key;}}catch{}return undefined;};

export default async function DashboardPage({searchParams}:{searchParams:Promise<{period?:string}>}){
 const ctx=await requirePageContext();
 const sp=await searchParams;
 const history=await readHistorical(ctx.businessId);
 const latestIssued=await prisma.invoice.findFirst({where:{businessId:ctx.businessId,status:"ISSUED"},select:{invoiceDate:true},orderBy:{invoiceDate:"desc"}});
 const issuedKey=latestIssued?periodKeyFor(latestIssued.invoiceDate.getUTCFullYear(),latestIssued.invoiceDate.getUTCMonth()+1):undefined;
 const latest=[...history.activityMonths,issuedKey].filter((v):v is string=>!!v).sort((a,b)=>order(b)-order(a))[0];
 const requested=safePeriod(sp.period);
 let report=await dashboard(ctx,requested);
 if(!requested&&latest&&report.totals.issuedCount===0&&!inReturnPeriod(history.invoices,report.period).length){
  report=await dashboard(ctx,latest);
 }
 const histRows=inReturnPeriod(history.invoices,report.period);
 const imported=historicalTotals(histRows);
 const invoiceCount=imported.count+report.totals.issuedCount;
 const sales=Number(report.totals.invoiceValue)+imported.value;
 const taxable=Number(report.totals.taxable)+imported.taxable;
 const customerIds=[...new Set(histRows.map(i=>i.recipientGstin).filter(Boolean))];
 const customerRecords=customerIds.length?await prisma.customer.findMany({where:{businessId:ctx.businessId,gstin:{in:customerIds}},select:{gstin:true,name:true}}):[];
 const names=new Map(customerRecords.map(c=>[c.gstin,c.name]));
 const customerTotals=new Map<string,{value:number;count:number}>();
 for(const row of histRows){const v=customerTotals.get(row.recipientGstin)??{value:0,count:0};v.value+=row.value;v.count++;customerTotals.set(row.recipientGstin,v);}
 const top=[...customerTotals].sort((a,b)=>b[1].value-a[1].value).slice(0,3);
 const copy=ownerCopy(report.business.preferredLanguage);
 const u=ownerUiCopy(report.business.preferredLanguage);
 const monthKeys=Array.from({length:7},(_,i)=>{const date=new Date(report.period.start+"T00:00:00Z");date.setUTCMonth(date.getUTCMonth()-3+i);return periodKeyFor(date.getUTCFullYear(),date.getUTCMonth()+1);});
 const activeKeys=[...new Set([...history.activityMonths,issuedKey].filter((v):v is string=>!!v))].sort((a,b)=>order(b)-order(a));
 const viewInvoices=`/invoices?period=${report.period.key}`;
 return <div className="mx-auto max-w-4xl space-y-5">
  <div className="flex items-center justify-between gap-3">
   <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[.12em] text-muted">{u.overview}</p><h1 className="mt-1 text-2xl font-semibold tracking-[-.05em] sm:text-3xl">{report.period.label}</h1></div>
   <Link href="/invoices/new" className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-[#173e32] px-4 text-sm font-semibold text-white"><Plus className="size-4"/>{u.newInvoice}</Link>
  </div>
  <nav aria-label={copy.chooseMonth} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
   {monthKeys.map(k=><Link key={k} href={`/?period=${k}`} aria-current={k===report.period.key?"date":undefined} className={`shrink-0 rounded-full border px-3.5 py-2 text-sm font-medium ${k===report.period.key?"border-[#173e32] bg-[#173e32] text-white":"border-line bg-white text-ink"}`}>{parsePeriodKey(k,"MONTHLY").label}</Link>)}
  </nav>
  {activeKeys.length>0&&!monthKeys.includes(activeKeys[0])&&<Link href={`/?period=${activeKeys[0]}`} className="inline-flex text-sm font-semibold text-brand-700">{u.latestActivity}: {parsePeriodKey(activeKeys[0],"MONTHLY").label} <ArrowRight className="ml-1 size-4"/></Link>}
  <section aria-label={u.salesSummary} className="overflow-hidden rounded-[24px] bg-[#173e32] text-white shadow-[0_16px_42px_-30px_rgba(20,44,33,.8)]">
   <div className="p-5 sm:p-7">
    <p className="text-sm font-medium text-white/75">{u.salesRecorded}</p>
    <p className="tabular mt-1 text-[clamp(2.1rem,7vw,3.7rem)] font-semibold leading-tight tracking-[-.06em]">{formatINR(sales.toFixed(2))}</p>
    <div className="mt-5 flex items-end justify-between gap-3 border-t border-white/20 pt-4">
     <div><p className="text-xs text-white/65">{copy.taxable}</p><p className="tabular mt-1 text-xl font-semibold">{formatINR(taxable.toFixed(2))}</p></div>
     <Link href={viewInvoices} className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-white px-3.5 text-sm font-semibold text-[#173e32]">{invoiceCount} {u.invoices} <ArrowRight className="size-4"/></Link>
    </div>
   </div>
  </section>
  <div className="grid grid-cols-2 gap-3">
   <div className="rounded-2xl border border-line bg-white p-4"><p className="text-sm text-muted">{u.imported}</p><p className="tabular mt-1 text-2xl font-semibold tracking-tight">{imported.count}</p><p className="mt-1 text-xs text-muted">{u.historicalBills}</p></div>
   <div className="rounded-2xl border border-line bg-white p-4"><p className="text-sm text-muted">{u.issued}</p><p className="tabular mt-1 text-2xl font-semibold tracking-tight">{report.totals.issuedCount}</p><p className="mt-1 text-xs text-muted">{u.newBills}</p></div>
  </div>
  <div className="rounded-2xl border border-line bg-white">
   <Link href="/returns" className="flex min-h-16 items-center justify-between gap-3 p-4"><div className="min-w-0"><p className="font-semibold">{u.gstStatus}</p><p className="mt-0.5 text-sm text-muted">{imported.count?u.importedNotVerified:u.notVerified}</p></div><ArrowRight className="size-5 shrink-0 text-brand-700"/></Link>
   <div className="mx-4 border-t border-line"/>
   <Link href={viewInvoices} className="flex min-h-16 items-center justify-between gap-3 p-4"><div className="min-w-0"><p className="font-semibold">{u.seeRecords}</p><p className="mt-0.5 text-sm text-muted">{invoiceCount} {u.invoices.toLowerCase()} · {report.period.label}</p></div><ArrowRight className="size-5 shrink-0 text-brand-700"/></Link>
   {top.length>0&&<><div className="mx-4 border-t border-line"/><section className="p-4"><div className="flex items-center justify-between"><h2 className="font-semibold">{copy.customers}</h2><Link href="/customers" className="text-sm font-semibold text-brand-700">{u.allCustomers}</Link></div><ul className="mt-2 divide-y divide-line">{top.map(([gstin,v])=><li key={gstin} className="flex items-center justify-between gap-3 py-2 text-sm"><div className="min-w-0"><p className="truncate font-medium">{names.get(gstin)?.startsWith("Imported GSTIN ")?u.customer+ " · "+gstin.slice(-5):names.get(gstin)||u.customer+" · "+gstin.slice(-5)}</p><p className="text-xs text-muted">{v.count} {u.invoices.toLowerCase()}</p></div><b className="tabular shrink-0">{formatINR(v.value.toFixed(2))}</b></li>)}</ul></section></>}
  </div>
  {report.totals.draftCount>0&&<Link href="/invoices?tab=DRAFT" className="flex items-center justify-between rounded-2xl border border-line bg-white p-4"><span className="font-semibold">{report.totals.draftCount} {copy.drafts}</span><ArrowRight className="size-5 text-brand-700"/></Link>}
  <div className="flex flex-wrap gap-4 text-sm font-semibold text-brand-700"><Link href="/gst-import" className="inline-flex items-center gap-1.5"><FileUp className="size-4"/>{copy.import}</Link><Link href="/gst-history" className="inline-flex items-center gap-1.5"><ReceiptText className="size-4"/>{copy.businessInsights}</Link></div>
  <details className="group border-t border-line pt-3 text-sm"><summary className="flex cursor-pointer list-none items-center justify-between gap-2 py-2 text-muted">{u.aboutFigures}<ChevronDown className="size-4 group-open:rotate-180"/></summary><p className="pb-2 leading-relaxed text-muted">{copy.taxableNote} {history.overlapCount? `${history.overlapCount} ${u.overlaps}`:""}</p></details>
 </div>;
}
