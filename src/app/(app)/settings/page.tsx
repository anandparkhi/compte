import Link from "next/link";
import { ArrowRight, FileInput, Landmark, Package, TrendingUp, Users } from "lucide-react";
import { requirePageContext } from "@/server/auth/session";
import { getBusiness } from "@/server/services/business";
import { prisma } from "@/server/db";
import { Card, PageHeader } from "@/components/ui";
import { BusinessForm } from "@/components/forms/business-form";

export const dynamic = "force-dynamic";
const items=[
 {href:"/customers",icon:Users,title:"Customers",detail:"Customer details and GSTINs"},
 {href:"/products",icon:Package,title:"Products & services",detail:"Prices, HSN/SAC and GST rates"},
 {href:"/gst-import",icon:FileInput,title:"Import GST history",detail:"Bring past invoices, customers and HSN data"},
 {href:"/gst-history",icon:TrendingUp,title:"Business insights",detail:"Understand past sales in your language"},
 {href:"/bank-reconciliation",icon:Landmark,title:"Bank / UPI matching",detail:"Check incoming payments against invoices"},
] as const;

export default async function SettingsPage(){
 const ctx=await requirePageContext();
 const [business,seq]=await Promise.all([
  getBusiness(ctx),
  prisma.invoiceNumberSequence.findMany({where:{businessId:ctx.businessId},orderBy:{financialYear:"desc"}})
 ]);
 return <div className="mx-auto max-w-4xl space-y-6">
  <PageHeader title="Settings" subtitle="Manage your business and records. No technical setup required."/>
  <section className="space-y-3"><h2 className="text-lg font-semibold">Business tools</h2>
   <div className="grid gap-3 sm:grid-cols-2">{items.map(item=><Link key={item.href} href={item.href} className="group">
    <Card className="flex h-full items-start gap-3 p-4 transition-colors group-hover:bg-canvas">
      <div className="rounded-xl bg-brand-50 p-2.5"><item.icon className="size-5 text-brand-700"/></div>
      <div className="min-w-0 flex-1"><h3 className="font-semibold">{item.title}</h3><p className="mt-1 text-xs text-muted">{item.detail}</p></div><ArrowRight className="size-4 text-brand-700"/>
    </Card>
   </Link>)}</div>
  </section>
  <section className="space-y-2"><h2 className="text-lg font-semibold">Business profile & language</h2><p className="text-sm text-muted">Update your registered business details, filing frequency and preferred language below.</p>
   <BusinessForm mode="settings" initial={{...business,tradeName:business.tradeName??"",registrationType:business.registrationType as "REGULAR",filingFrequency:business.filingFrequency as "MONTHLY",preferredLanguage:business.preferredLanguage as "en",phoneIsGstnRegistered:business.phoneIsGstnRegistered as "UNKNOWN"}}/>
  </section>
  <details className="rounded-xl border border-line bg-white p-4"><summary className="cursor-pointer font-semibold">Invoice numbering & compliance details</summary>
   <h3 className="mt-4 text-sm font-semibold">Invoice sequence</h3><ul className="mt-2 space-y-1 text-sm">{seq.map(v=><li key={v.id}>FY {v.financialYear} · {v.prefix} · next number {v.nextNumber}</li>)}</ul>
   <p className="mt-2 text-xs text-muted">Invoice numbers follow a financial-year series. Previously issued invoices cannot be changed.</p>
   <h3 className="mt-4 text-sm font-semibold">GST verification</h3><p className="mt-1 text-sm">{business.gstinVerificationStatus==="LIVE_VERIFIED"?"GSTIN verified with authorized source":"GSTIN format checked; live registration not verified."}</p>
   <p className="mt-2 text-xs text-muted">Compte never asks for your GST portal password or GST verification SMS codes. Filing and payment information must be verified separately.</p>
  </details>
 </div>;
}
