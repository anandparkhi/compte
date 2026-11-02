import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { requirePageContext } from "@/server/auth/session";
import { listImports } from "@/server/services/gst-import";
import { SyncHistoricalProducts } from "@/components/forms/sync-historical-products";
import { GstImportForm } from "@/components/forms/gst-import-form";
import { Card, PageHeader } from "@/components/ui";
export const dynamic="force-dynamic";

export default async function ImportPage(){
 const ctx=await requirePageContext();
 const imports=await listImports(ctx);
 return <div className="mx-auto max-w-4xl space-y-5">
  <PageHeader title="Import GST history" subtitle="Bring your past sales, customers and HSN records into Compte" />
  <GstImportForm/>
  <Card>
   <div className="flex items-center justify-between gap-2"><h2 className="font-semibold">Previously imported returns</h2><Link href="/gst-history" className="text-sm font-semibold text-brand-700">Business insights →</Link></div>
   {imports.length?<ul className="mt-3 divide-y divide-line">{imports.map(i=><li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-semibold">GSTR-1 · {i.periodKey.slice(0,2)}/{i.periodKey.slice(2)}</p><p className="text-xs text-muted">{i.sourceName} · Added {i.createdAt.toLocaleDateString("en-IN")}</p></div><Link href={`/invoices?period=${i.periodKey}`} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700">View invoices <ArrowRight className="size-4"/></Link></li>)}</ul>:<p className="mt-2 text-sm text-muted">No GST returns have been imported yet. Upload your first file above.</p>}
  </Card>
  {imports.length>0&&<details className="rounded-xl border border-line bg-white p-4"><summary className="cursor-pointer font-semibold">Missing products from older imports?</summary><p className="mt-2 text-sm text-muted">If you imported data before product suggestions were available, you can add them now for review.</p><div className="mt-3"><SyncHistoricalProducts/></div></details>}
  <p className="text-xs text-muted">This feature imports selected GSTR-1 B2B and HSN data only. It is not a direct GST portal connection. Uploaded return data does not prove filing status, tax paid or money received.</p>
 </div>;
}
