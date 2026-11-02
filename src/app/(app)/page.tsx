import Link from "next/link";
import { ArrowRight, FileInput, Landmark, Mic, ReceiptText, TrendingUp, Users } from "lucide-react";
import { requirePageContext } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { readHistorical, inReturnPeriod, historicalTotals } from "@/server/services/historical-records";
import { dashboard } from "@/server/services/dashboard";
import { ownerCopy } from "@/lib/i18n/owner-copy";
import { Badge, Card, CardTitle, LinkButton, PageHeader, Stat } from "@/components/ui";
import { formatINR } from "@/lib/domain/money";
import { parsePeriodKey, periodKeyFor } from "@/lib/domain/periods";

export const dynamic = "force-dynamic";

const position = (key: string) => Number(key.slice(2)) * 12 + Number(key.slice(0, 2));
const validKey = (key?: string) => { try { if (!key) return null; parsePeriodKey(key, "MONTHLY"); return key; } catch { return null; } };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const ctx = await requirePageContext();
  const sp = await searchParams;
  const historic = await readHistorical(ctx.businessId);
  const mostRecentImport = [...historic.activityMonths].sort((a,b)=>position(b)-position(a))[0];
  const newestIssued = await prisma.invoice.findFirst({where:{businessId:ctx.businessId,status:"ISSUED"},select:{invoiceDate:true},orderBy:{invoiceDate:"desc"}});
  const issuedMonth = newestIssued ? periodKeyFor(newestIssued.invoiceDate.getUTCFullYear(),newestIssued.invoiceDate.getUTCMonth()+1) : undefined;
  const mostRecentActivity = [mostRecentImport,issuedMonth].filter((v):v is string=>!!v).sort((a,b)=>position(b)-position(a))[0];
  const requested = validKey(sp.period);
  let d = await dashboard(ctx, requested ?? undefined);
  // First-time businesses should see their actual imported history, not an empty current month.
  const currentHasImports = inReturnPeriod(historic.invoices, d.period).length > 0;
  const showingLatestImport = !requested && !!mostRecentActivity && mostRecentActivity!==d.period.key && !currentHasImports && d.totals.issuedCount === 0;
  if (showingLatestImport) d = await dashboard(ctx, mostRecentActivity);

  const importedRows = inReturnPeriod(historic.invoices, d.period);
  const imported = historicalTotals(importedRows);
  const buyers = new Set([...d.buyerKeys,...importedRows.map(i=>i.recipientGstin)]).size;
  const copy = ownerCopy(d.business.preferredLanguage);
  const combinedTaxable = (Number(d.totals.taxable) + imported.taxable).toFixed(2);
  const combinedValue = (Number(d.totals.invoiceValue) + imported.value).toFixed(2);
  const invoicesCount = d.totals.issuedCount + imported.count;
  const months = Array.from({ length: 7 }, (_, i) => {
    const base = new Date(`${d.period.start}T00:00:00Z`);
    base.setUTCMonth(base.getUTCMonth() - 3 + i);
    return parsePeriodKey(periodKeyFor(base.getUTCFullYear(), base.getUTCMonth() + 1), "MONTHLY");
  });
  const importedKeys = [...historic.activityMonths].sort((a,b) => position(b) - position(a));
  const topCustomers = new Map<string,{gstin:string;amount:number;count:number}>();
  for(const row of importedRows){
    const old = topCustomers.get(row.recipientGstin) ?? {gstin:row.recipientGstin,amount:0,count:0};
    old.amount += Number(row.value); old.count++; topCustomers.set(row.recipientGstin,old);
  }
  const leaders = [...topCustomers.values()].sort((a,b)=>b.amount-a.amount).slice(0,4);
  const hasHistory = historic.periods.length > 0;
  const hasSales = invoicesCount > 0;
  const overlaps=historic.overlapCount;
  const monthUrl = `/invoices?period=${d.period.key}`;
  return (
    <div className="space-y-6">
      <PageHeader title={copy.homeTitle} subtitle={`${copy.period}: ${d.period.label} · ${d.business.tradeName || d.business.legalName}`} />
      {showingLatestImport && <div role="status" className="rounded-xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-700">
        {copy.latestImport}
      </div>}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/invoices/new" className="flex min-h-24 items-center gap-3 rounded-2xl bg-[#193e32] p-4 text-white shadow-sm hover:bg-[#235541]">
          <Mic className="size-7 shrink-0" aria-hidden /><span className="min-w-0"><b className="block text-base">{copy.create}</b><span className="text-xs text-white/85">{copy.createHint}</span></span><ArrowRight className="ml-auto size-4 shrink-0"/>
        </Link>
        <Link href="/gst-import" className="flex min-h-24 items-center gap-3 rounded-2xl border border-line bg-white p-4 hover:bg-canvas">
          <FileInput className="size-6 shrink-0 text-brand-700" aria-hidden/><span className="min-w-0"><b className="block text-base">{copy.import}</b><span className="text-xs text-muted">{copy.importHint}</span></span>
        </Link>
      </div>
      <section aria-label="Select sales month" className="space-y-2">
        <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">{copy.chooseMonth}</h2><Link href="/gst-history" className="text-xs font-semibold text-brand-700">{copy.insights} →</Link></div>
        <nav className="-mx-1 flex gap-2 overflow-x-auto px-1 py-1" aria-label="Sales month">
          {months.map(m=><Link key={m.key} href={`/?period=${m.key}`} aria-current={m.key===d.period.key?"date":undefined} className={`shrink-0 rounded-full px-4 py-2.5 text-sm font-medium ${m.key===d.period.key?"bg-[#193e32] text-white":"bg-white text-ink ring-1 ring-line"}`}>{m.label}</Link>)}
        </nav>
        {hasHistory && <div className="flex flex-wrap items-center gap-1.5"><span className="text-xs text-muted">{copy.imported}:</span>{importedKeys.slice(0,8).map(k=><Link href={`/?period=${k}`} key={k} className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${k===d.period.key?"bg-brand-100 text-brand-700":"bg-canvas text-ink"}`}>{parsePeriodKey(k,"MONTHLY").label}</Link>)}</div>}
      </section>
      {hasSales ? <>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Link href={monthUrl}><Stat label={copy.taxable} value={formatINR(combinedTaxable)} note={`${imported.count} historical · ${d.totals.issuedCount} new invoices`} /></Link>
          <Link href={monthUrl}><Stat label={copy.invoiceValue} value={formatINR(combinedValue)} note={copy.invoiceAmountNote} /></Link>
          <Link href={monthUrl}><Stat label={copy.count} value={invoicesCount} note={`Imported ${imported.count} · Compte ${d.totals.issuedCount}`} /></Link>
          <Link href={monthUrl}><Stat label={copy.buyers} value={buyers} note={copy.buyersNote} /></Link>
        </div>
        <p className="text-xs text-muted">{copy.taxableNote}{overlaps>0 ? ` ${overlaps} overlapping historical invoice(s) were excluded from these totals.` : ""}</p>
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle>{copy.sourceTitle}</CardTitle><p className="mt-1 text-sm text-muted">{copy.sourceHint} · {d.period.label}</p></div><LinkButton size="sm" href={monthUrl} variant="secondary">{copy.seeInvoices} ({invoicesCount}) <ArrowRight className="size-4"/></LinkButton></div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-canvas p-3"><p className="text-muted">{copy.history}</p><p className="mt-1 text-lg font-bold">{formatINR(imported.taxable.toFixed(2))}</p><p className="text-xs text-muted">{imported.count} · {copy.readOnly}</p></div>
            <div className="rounded-xl bg-canvas p-3"><p className="text-muted">{copy.newlyIssued}</p><p className="mt-1 text-lg font-bold">{formatINR(d.totals.taxable)}</p><p className="text-xs text-muted">{d.totals.issuedCount} · {copy.newlyIssuedShort}</p></div>
          </div>
        </Card>
      </> : <Card className="space-y-3"><CardTitle>{copy.noData} · {d.period.label}</CardTitle><p className="text-sm text-muted">{copy.noDataHint}</p><div className="flex flex-wrap gap-2"><LinkButton href="/gst-import" size="sm">{copy.import}</LinkButton><LinkButton href="/invoices/new" variant="outline" size="sm">{copy.create}</LinkButton></div></Card>}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between gap-2"><CardTitle>{copy.returnInfo}</CardTitle><Link href="/returns" className="text-sm font-semibold text-brand-700">{copy.viewReturns} →</Link></div>
          <div className="mt-3 flex items-start gap-3 rounded-xl bg-canvas p-3"><Landmark className="mt-0.5 size-5 text-brand-700"/><div><p className="text-sm font-semibold">{imported.count ? copy.returnImported : copy.returnUnverified}</p><p className="mt-1 text-xs text-muted">{imported.count ? copy.returnNote : copy.returnEmpty}</p></div></div>
          {d.totals.issuedCount>0 && <p className="mt-3 text-xs text-muted">{copy.taxNew}: {formatINR(d.totals.gst)}. {copy.taxNewNote}</p>}
        </Card>
        <Card>
          <div className="flex justify-between gap-2"><CardTitle>{copy.customers}</CardTitle><Link href="/customers" className="text-sm font-semibold text-brand-700">{copy.manageCustomers} →</Link></div>
          {leaders.length ? <ul className="mt-2 divide-y divide-line">{leaders.map(c=><li key={c.gstin} className="flex items-center justify-between gap-3 py-2.5 text-sm"><div><p className="font-semibold">{c.gstin}</p><p className="text-xs text-muted">{c.count} imported invoice{c.count!==1?"s":""}</p></div><p className="font-semibold">{formatINR(c.amount.toFixed(2))}</p></li>)}</ul>
          : d.customers.length ? <ul className="mt-2 divide-y divide-line">{d.customers.map(c=><li key={c.name} className="flex items-center justify-between gap-2 py-2 text-sm"><span>{c.name}</span><b>{formatINR(c.taxable)}</b></li>)}</ul>
          : <p className="mt-3 text-sm text-muted">{copy.noCustomers}</p>}
        </Card>
      </div>
      {d.totals.draftCount>0 && <Link href="/invoices?status=DRAFT"><Card className="flex items-center justify-between gap-3"><span><b>{d.totals.draftCount} invoice draft(s)</b><span className="block text-xs text-muted">{copy.draftsHint}</span></span><ArrowRight className="size-5 text-brand-700"/></Card></Link>}
      <div className="flex flex-wrap gap-3 text-sm"><Link href="/gst-history" className="inline-flex items-center gap-2 font-semibold text-brand-700"><TrendingUp className="size-4"/>{copy.businessInsights}</Link><Link href="/invoices" className="inline-flex items-center gap-2 font-semibold text-brand-700"><ReceiptText className="size-4"/>{copy.allInvoices}</Link><Link href="/customers" className="inline-flex items-center gap-2 font-semibold text-brand-700"><Users className="size-4"/>{copy.manage}</Link></div>
    </div>
  );
}
