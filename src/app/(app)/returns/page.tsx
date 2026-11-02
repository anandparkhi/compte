import Link from "next/link";
import { ArrowRight, FileInput, Landmark } from "lucide-react";
import { requirePageContext } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { readHistorical, inReturnPeriod, historicalTotals } from "@/server/services/historical-records";
import { periodSummaries } from "@/server/services/returns";
import { getT } from "@/lib/i18n/server";
import { Badge, Card, PageHeader } from "@/components/ui";
import { formatINR } from "@/lib/domain/money";
import { currentFinancialYear, financialYearOf, fyStartYear } from "@/lib/domain/periods";

export const dynamic = "force-dynamic";

export default async function ReturnsPage({ searchParams }: { searchParams: Promise<{ fy?: string }> }) {
  const ctx = await requirePageContext();
  const [business,historical] = await Promise.all([
    prisma.business.findUniqueOrThrow({where:{id:ctx.businessId}}),
    readHistorical(ctx.businessId)
  ]);
  const {t} = await getT(business.preferredLanguage);
  const sp = await searchParams;
  const current = currentFinancialYear();
  const importedFys = historical.periods.map(p=>financialYearOf(`${p.slice(2)}-${p.slice(0,2)}-01`));
  const options = [...new Set([current,...importedFys])].sort((a,b)=>b.localeCompare(a));
  const selected = sp.fy && options.includes(sp.fy) ? sp.fy : (importedFys.length ? [...importedFys].sort().at(-1)! : current);
  const rows = await periodSummaries(ctx,selected);
  const withData = rows.filter(r=>r.issuedCount>0 || historical.periods.some(k=>r.period.months.some(m=>k===String(m.month).padStart(2,"0")+m.year)));
  const noData = rows.filter(r=>!withData.includes(r));
  return <div className="mx-auto max-w-5xl space-y-5">
    <PageHeader title={t("returns_title")} subtitle={`GST activity and preparation · ${business.filingFrequency==="MONTHLY"?"Monthly":"Quarterly"} filing`} />
    <div className="rounded-xl border border-line bg-white p-4 text-sm"><p className="font-semibold">Understanding your returns</p><p className="mt-1 text-muted">Imported GSTR-1 data shows historical sales, but does not confirm that a return was filed with GSTN. Compte-issued invoices are shown separately so you know where every figure comes from.</p></div>
    <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold">{t("returns_fy")}:</span>{options.map(f=><Link key={f} href={`/returns?fy=${f}`} aria-current={f===selected?"page":undefined} className={`rounded-full px-4 py-2 text-sm font-medium ${f===selected?"bg-[#193e32] text-white":"bg-white ring-1 ring-line"}`}>FY {f}</Link>)}</div>
    {withData.length ? <section className="space-y-3"><h2 className="font-semibold">Periods with business records</h2><div className="grid gap-3 md:grid-cols-2">{withData.map(r=>{
      const imported = historicalTotals(inReturnPeriod(historical.invoices,r.period));
      const hasImport = r.period.months.some(m=>historical.periods.includes(String(m.month).padStart(2,"0")+m.year));
      const count = imported.count+r.issuedCount;
      const taxable = Number(r.taxable)+imported.taxable;
      return <Card key={r.period.key} className="space-y-3">
        <div className="flex items-start justify-between gap-2"><div><h3 className="text-lg font-bold">{r.period.label}</h3><p className="text-xs text-muted">GST period {r.period.key} · {r.ended?"Completed period":"Current / upcoming period"}</p></div><Badge tone="brand">{count} invoice{count!==1?"s":""}</Badge></div>
        <div><p className="text-xs text-muted">Taxable sales recorded</p><p className="text-2xl font-bold">{formatINR(taxable.toFixed(2))}</p><p className="mt-1 text-xs text-muted">{imported.count} imported · {r.issuedCount} issued in Compte</p></div>
        {hasImport && <div className="rounded-lg bg-brand-50 px-3 py-2 text-sm"><span className="font-semibold text-brand-700">GSTR-1 data imported</span><p className="mt-1 text-xs text-muted">{formatINR(imported.taxable.toFixed(2))} historical B2B taxable value; filing status not verified.</p></div>}
        {r.issuedCount>0 && <p className="text-xs text-muted">GST on newly issued Compte invoices: {formatINR(r.tax)} (does not include GST on imported invoices).</p>}
        <div className="flex flex-wrap items-center gap-2 text-xs"><Badge tone="warn">Portal filing not verified</Badge>{hasImport || r.issuedCount>0 ? <Badge>Nil filing not applicable</Badge> : null}</div>
        <Link href={`/returns/${r.period.key}`} className="inline-flex items-center gap-2 rounded-xl bg-brand-50 px-4 py-2.5 text-sm font-semibold text-brand-700">View invoices and GST details <ArrowRight className="size-4"/></Link>
      </Card>;
    })}</div></section>
    : <Card className="space-y-2"><h2 className="font-semibold">No GST records for this financial year yet</h2><p className="text-sm text-muted">Import historical returns to see your sales by period. No record in Compte is not evidence that a return was not filed.</p><Link className="inline-flex items-center gap-2 font-semibold text-brand-700" href="/gst-import"><FileInput className="size-4"/>Import GST history →</Link></Card>}
    {noData.length>0 && <details className="rounded-xl border border-line bg-white p-4"><summary className="cursor-pointer font-semibold">Other periods ({noData.length})</summary><p className="mt-2 text-xs text-muted">These periods have no sales recorded in Compte. This does not establish whether a GST return was filed.</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{noData.map(r=><Link key={r.period.key} href={`/returns/${r.period.key}`} className="flex items-center justify-between rounded-lg bg-canvas p-3 text-sm"><span>{r.period.label}</span><ArrowRight className="size-4"/></Link>)}</div></details>}
    <Link href="/gst-import" className="inline-flex items-center gap-2 text-sm font-semibold text-brand-700"><Landmark className="size-4"/>Import another GST return</Link>
  </div>;
}
