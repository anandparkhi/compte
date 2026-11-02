import Link from "next/link";
import { ArrowRight, ChevronDown, FileUp } from "lucide-react";
import { requirePageContext } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { readHistorical, inReturnPeriod, historicalTotals } from "@/server/services/historical-records";
import { periodSummaries } from "@/server/services/returns";
import { ownerUiCopy } from "@/lib/i18n/owner-ui-copy";
import { formatINR } from "@/lib/domain/money";
import { currentFinancialYear, financialYearOf } from "@/lib/domain/periods";

export const dynamic="force-dynamic";
export default async function ReturnsPage({searchParams}:{searchParams:Promise<{fy?:string}>}){
 const ctx=await requirePageContext();
 const [business,historical]=await Promise.all([prisma.business.findUniqueOrThrow({where:{id:ctx.businessId}}),readHistorical(ctx.businessId)]);
 const u=ownerUiCopy(business.preferredLanguage);
 const sp=await searchParams;
 const importedFys=historical.periods.map(p=>financialYearOf(`${p.slice(2)}-${p.slice(0,2)}-01`));
 const options=[...new Set([currentFinancialYear(),...importedFys])].sort((a,b)=>b.localeCompare(a));
 const fy=sp.fy&&options.includes(sp.fy)?sp.fy:(importedFys.length?[...importedFys].sort().at(-1)!:currentFinancialYear());
 const summaries=await periodSummaries(ctx,fy);
 const grouped=summaries.map(r=>{
  const historicalTotalsForPeriod=historicalTotals(inReturnPeriod(historical.invoices,r.period));
  const hasImport=r.period.months.some(m=>historical.periods.includes(String(m.month).padStart(2,"0")+m.year));
  return {r,imported:historicalTotalsForPeriod,hasImport,count:historicalTotalsForPeriod.count+r.issuedCount,taxable:Number(r.taxable)+historicalTotalsForPeriod.taxable};
 });
 const withData=grouped.filter(x=>x.count>0||x.hasImport);
 const without=grouped.filter(x=>!withData.includes(x));
 return <div className="mx-auto max-w-4xl space-y-5">
  <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.12em] text-muted">GST</p><h1 className="mt-1 text-2xl font-semibold tracking-[-.05em] sm:text-3xl">{u.returnTitle}</h1><p className="mt-1 text-sm text-muted">{u.returnSubtitle}</p></div>
   <Link href="/gst-import" className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full bg-[#173e32] px-3.5 text-sm font-semibold text-white"><FileUp className="size-4"/>{u.importAction}</Link>
  </div>
  <nav aria-label="Financial year" className="flex gap-2 overflow-x-auto pb-1">{options.map(year=><Link key={year} href={`/returns?fy=${year}`} aria-current={fy===year?"page":undefined} className={`shrink-0 rounded-full border px-3.5 py-2 text-sm font-semibold ${fy===year?"border-[#173e32] bg-[#173e32] text-white":"border-line bg-white"}`}>FY {year}</Link>)}</nav>
  <section className="overflow-hidden rounded-[22px] border border-line bg-white">
   <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3.5"><h2 className="font-semibold">{u.periodsWithData}</h2><span className="text-sm text-muted">{withData.length}</span></div>
   {withData.length? <ul className="divide-y divide-line">{withData.map(x=><li key={x.r.period.key}><Link href={`/returns/${x.r.period.key}`} className="flex items-center justify-between gap-4 px-4 py-4 hover:bg-canvas">
     <div className="min-w-0"><p className="font-semibold leading-snug">{x.r.period.label}</p><p className="mt-1 text-xs text-muted">{x.imported.count} {u.importedLabel.toLowerCase()} · {x.r.issuedCount} {u.issuedLabel.toLowerCase()} {u.invoices.toLowerCase()}</p><p className="mt-1 text-xs text-muted">{u.fileNotVerified}</p></div>
     <div className="shrink-0 text-right"><p className="tabular text-lg font-semibold tracking-tight">{formatINR(x.taxable.toFixed(2))}</p><p className="mt-0.5 text-[11px] text-muted">{u.totalTaxable}</p></div>
     <ArrowRight className="size-4 shrink-0 text-brand-700"/>
   </Link></li>)}</ul>
   :<div className="p-5"><h3 className="font-semibold">{u.emptyPeriod}</h3><p className="mt-1 text-sm text-muted">{u.emptyExplain}</p><Link href="/gst-import" className="mt-3 inline-flex text-sm font-semibold text-brand-700">{u.importAction} <ArrowRight className="ml-1 size-4"/></Link></div>}
  </section>
  {without.length>0&&<details className="group overflow-hidden rounded-2xl border border-line bg-white"><summary className="flex cursor-pointer list-none items-center justify-between p-4 font-medium">{u.otherPeriods} ({without.length})<ChevronDown className="size-4 text-muted group-open:rotate-180"/></summary><ul className="divide-y divide-line border-t border-line">{without.map(x=><li key={x.r.period.key}><Link href={`/returns/${x.r.period.key}`} className="flex items-center justify-between px-4 py-3 text-sm"><span>{x.r.period.label}</span><ArrowRight className="size-4 text-muted"/></Link></li>)}</ul></details>}
  <details className="group border-t border-line pt-3 text-sm"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-2 text-muted">{u.returnHelp}<ChevronDown className="size-4 group-open:rotate-180"/></summary><p className="pb-2 leading-relaxed text-muted">{u.returnHelpDetail}</p></details>
 </div>;
}
