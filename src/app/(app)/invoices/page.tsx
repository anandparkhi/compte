import Link from "next/link";
import { ArrowRight, FileInput, Plus, Search } from "lucide-react";
import { requirePageContext } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { invoiceMonthKey } from "@/lib/gst-import/invoice-month";
import { parsePeriodKey } from "@/lib/domain/periods";
import { readHistorical } from "@/server/services/historical-records";
import { listInvoices } from "@/server/services/invoices";
import { listCustomers } from "@/server/services/catalog";
import { getT } from "@/lib/i18n/server";
import { Badge, Card, Empty, LinkButton, PageHeader } from "@/components/ui";
import { formatINR } from "@/lib/domain/money";

export const dynamic = "force-dynamic";
const invoiceDate = (d:string) => /^\d{2}-\d{2}-\d{4}$/.test(d)?d.slice(6)+"-"+d.slice(3,5)+"-"+d.slice(0,2):d;
const validMonth = (key?:string) => {try{if(!key)return null;return parsePeriodKey(key,"MONTHLY");}catch{return null;}};
type Tab = "ALL"|"IMPORTED"|"ISSUED"|"DRAFT"|"CANCELLED";

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ status?: string; customer?: string; period?: string; tab?: string }> }) {
 const ctx=await requirePageContext();
 const sp=await searchParams;
 const b=await prisma.business.findUniqueOrThrow({where:{id:ctx.businessId}});
 const {t}=await getT(b.preferredLanguage);
 const month=validMonth(sp.period);
 const tab:Tab=sp.tab==="IMPORTED"||sp.tab==="ISSUED"||sp.tab==="DRAFT"||sp.tab==="CANCELLED"?sp.tab:sp.status==="DRAFT"?"DRAFT":sp.status==="ISSUED"?"ISSUED":"ALL";
 const [rows,customers,historical]=await Promise.all([listInvoices(ctx),listCustomers(ctx),readHistorical(ctx.businessId)]);
 const selectedCustomer=customers.find(c=>c.id===sp.customer);
 const newRows=rows.filter(i=>(!month||i.invoiceDate>=month.start&&i.invoiceDate<month.endExclusive)&&(!selectedCustomer||i.customerId===selectedCustomer.id));
 const oldRows=historical.invoices.filter(i=>(!month||invoiceMonthKey(i.date,i.periodKey)===month.key)&&(!selectedCustomer||!!selectedCustomer.gstin&&i.recipientGstin===selectedCustomer.gstin));
 const links=(which:Tab,c?:string)=>{const q=new URLSearchParams();if(which!=="ALL")q.set("tab",which);if(month)q.set("period",month.key);if(c)q.set("customer",c);return "/invoices"+(q.size?"?"+q.toString():"");};
 const items=[
  ...newRows.filter(i=>tab==="ALL"||tab==="DRAFT"&&i.status==="DRAFT"||tab==="ISSUED"&&i.status==="ISSUED"||tab==="CANCELLED"&&i.status==="CANCELLED").map(i=>({id:i.id,date:i.invoiceDate,number:i.invoiceNumber??"Draft invoice",recipient:i.customer?.name??"Customer not selected",amount:i.grandTotal,kind:i.status==="DRAFT"?"DRAFT":i.status==="CANCELLED"?"CANCELLED":"ISSUED",href:`/invoices/${i.id}`})),
  ...(tab==="ALL"||tab==="IMPORTED"?oldRows.map(i=>({id:i.id,date:invoiceDate(i.date),number:i.number,recipient:i.recipientGstin,amount:i.value.toFixed(2),kind:"IMPORTED",href:`/invoices/imported/${i.id.replace(":","/")}`})) : [])
 ].sort((a,b)=>b.date.localeCompare(a.date));
 return <div className="mx-auto max-w-5xl space-y-5">
  <PageHeader title={t("invoices_title")} subtitle="One place for new invoices and imported historical records" actions={<LinkButton href="/invoices/new"><Plus className="size-4"/>{t("nav_create")}</LinkButton>}/>
  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
   <Card className="p-3 sm:p-4"><p className="text-xs text-muted">Issued in Compte</p><p className="mt-1 text-xl font-bold">{newRows.filter(i=>i.status==="ISSUED").length}</p></Card>
   <Card className="p-3 sm:p-4"><p className="text-xs text-muted">Imported history</p><p className="mt-1 text-xl font-bold">{oldRows.length}</p></Card>
   <Card className="col-span-2 p-3 sm:col-span-1 sm:p-4"><p className="text-xs text-muted">Unfinished drafts</p><p className="mt-1 text-xl font-bold">{newRows.filter(i=>i.status==="DRAFT").length}</p></Card>
  </div>
  <nav aria-label="Invoice type" className="flex gap-2 overflow-x-auto pb-1">
   {([{k:"ALL",name:"All invoices"},{k:"IMPORTED",name:"Imported"},{k:"ISSUED",name:"Issued in Compte"},{k:"DRAFT",name:"Drafts"},{k:"CANCELLED",name:"Cancelled"}] as const).map(x=><Link key={x.k} aria-current={tab===x.k?"page":undefined} href={links(x.k,sp.customer)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${tab===x.k?"bg-[#193e32] text-white":"bg-white ring-1 ring-line"}`}>{x.name}</Link>)}
  </nav>
  <div className="flex flex-wrap items-center gap-3 text-sm">
   {month&&<span className="rounded-lg bg-brand-50 px-3 py-2 font-medium">{month.label} <Link href="/invoices" className="ml-2 text-brand-700 underline">Clear</Link></span>}
   {selectedCustomer&&<span className="rounded-lg bg-brand-50 px-3 py-2">Customer: {selectedCustomer.name} <Link href={links(tab)} className="ml-2 text-brand-700 underline">Clear</Link></span>}
   <details className="min-w-0 rounded-lg border border-line bg-white px-3 py-2"><summary className="cursor-pointer font-medium"><Search className="mr-1 inline size-4"/>Filter by customer</summary><div className="mt-2 flex max-h-48 flex-col gap-1 overflow-auto">{customers.map(c=><Link key={c.id} href={links(tab,c.id)} className="rounded px-2 py-1.5 hover:bg-canvas">{c.name}</Link>)}</div></details>
  </div>
  <Card className="p-0">
   <div className="flex items-center justify-between border-b border-line px-4 py-3"><h2 className="font-semibold">{items.length} record{items.length!==1?"s":""}</h2><span className="text-xs text-muted">Newest first</span></div>
   {items.length?<ul className="divide-y divide-line">{items.map(i=><li key={i.kind+":"+i.id}><Link href={i.href} className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-canvas"><div className="min-w-0 space-y-1"><p className="truncate font-semibold">{i.recipient}</p><p className="text-xs text-muted">{i.number} · {i.date}</p><Badge tone={i.kind==="IMPORTED"?"info":i.kind==="DRAFT"||i.kind==="CANCELLED"?"warn":"brand"}>{i.kind==="IMPORTED"?"Imported · read-only":i.kind==="DRAFT"?"Draft":i.kind==="CANCELLED"?"Cancelled · retained record":"Issued in Compte"}</Badge></div><div className="flex shrink-0 items-center gap-2"><b className="tabular text-sm">{formatINR(i.amount)}</b><ArrowRight className="size-4 text-brand-700"/></div></Link></li>)}</ul>
   : <div className="space-y-3 p-6"><Empty>No invoices match this view. An empty list does not mean you had no sales.</Empty><Link href="/gst-import" className="inline-flex items-center gap-2 text-sm font-semibold text-brand-700"><FileInput className="size-4"/>Import historical invoices →</Link></div>}
  </Card>
  <p className="text-xs text-muted">Imported invoices are read-only records extracted from GST return files. They are not newly issued, verified as filed or confirmed paid. Review duplicates when combining imported and new figures.</p>
 </div>;
}
