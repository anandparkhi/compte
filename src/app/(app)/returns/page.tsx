import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { requirePageContext } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { readHistorical,inReturnPeriod,historicalTotals } from "@/server/services/historical-records";
import { periodSummaries } from "@/server/services/returns";
import { getT } from "@/lib/i18n/server";
import { Badge, Card, PageHeader } from "@/components/ui";
import { FilingStatusBadge } from "@/components/filing-status-badge";
import { formatINR } from "@/lib/domain/money";
import { currentFinancialYear, fyStartYear } from "@/lib/domain/periods";
import type { FilingStatus } from "@/lib/domain/filing-state";

export const dynamic = "force-dynamic";
export default async function ReturnsPage({ searchParams }: { searchParams: Promise<{ fy?: string }> }) {
  const ctx = await requirePageContext();
  const b = await prisma.business.findUniqueOrThrow({ where: { id: ctx.businessId } });
  const { t } = await getT(b.preferredLanguage);
  const sp = await searchParams;
  const cur = currentFinancialYear();
  let fy = sp.fy ?? cur;
  try { fyStartYear(fy); } catch { fy = cur; }
  const s = fyStartYear(cur);
  const fys = [`${s - 1}-${String(s % 100).padStart(2, "0")}`, cur];
  const [rows,historical] = await Promise.all([periodSummaries(ctx, fy),readHistorical(ctx.businessId)]);
  const label = (st: string | undefined) => t(`fs_${st ?? "NOT_STARTED"}` as Parameters<typeof t>[0]);
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader title={t("returns_title")} subtitle={`${b.filingFrequency === "MONTHLY" ? "Monthly" : "Quarterly (QRMP)"} filer · GSTR-1 preparation and nil filing guidance`} />
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold">{t("returns_fy")}</span>
        {fys.map((f) => <Link key={f} href={`/returns?fy=${f}`} className={`rounded-full px-3 py-1.5 text-sm font-medium ${f === fy ? "bg-ink text-white" : "bg-white ring-1 ring-line"}`}>FY {f}</Link>)}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {rows.map((r) => { const imported=historicalTotals(inReturnPeriod(historical.invoices,r.period)); const hasImport=r.period.months.some(m=>historical.periods.includes(String(m.month).padStart(2,"0")+m.year)); return (
          <Card key={r.period.key} className={r.ended ? "" : "opacity-75"}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-lg font-bold">{r.period.label}</p>
                <p className="text-xs text-muted">GSTN period {r.period.key} · {r.ended ? "ended" : "in progress / future"}</p>
              </div>
              {r.issuedCount + imported.count > 0 ? <Badge tone="brand">{r.issuedCount + imported.count} invoice{r.issuedCount + imported.count !== 1 ? "s" : ""} recorded</Badge> : <Badge>No sales data</Badge>}
            </div>
            <dl className="tabular mt-3 grid grid-cols-2 gap-2 text-sm">
              <div><dt className="text-xs text-muted">Taxable value (recorded + imported)</dt><dd className="font-semibold">{formatINR((Number(r.taxable) + imported.taxable).toFixed(2))}</dd></div>
              <div><dt className="text-xs text-muted">GST from Compte invoices</dt><dd className="font-semibold">{formatINR(r.tax)}</dd></div>
            </dl>
            {hasImport && <div className="mt-3 rounded-lg bg-brand-50 p-3 text-sm"><b>Historical GSTR-1 imported</b><p>{imported.count} invoices · {formatINR(imported.taxable.toFixed(2))} taxable</p><p className="text-xs">Includes {imported.count} imported B2B invoices. Import does not verify filing or cover all GST sections. GST on imported invoices is not available from current parsed data.</p></div>}
            {(r.draftCount > 0 || r.purchaseCount > 0) && <p className="mt-2 text-xs text-warn-600">{r.draftCount > 0 && `${r.draftCount} draft(s) `}{r.purchaseCount > 0 && `${r.purchaseCount} purchase record(s)`}</p>}
            <div className="mt-3 space-y-1.5 text-sm">
              {imported.count > 0 && <p className="text-xs font-semibold text-warn-600">Non-nil sales present in imported records. Do not file a nil GSTR-1 for this period.</p>}
              <div className="flex items-center justify-between"><span>GSTR-1 nil workflow</span>{imported.count > 0 || r.issuedCount > 0 ? <Badge tone="warn">Not applicable — sales recorded</Badge> : <FilingStatusBadge status={(r.nilGstr1?.status ?? "NOT_STARTED") as FilingStatus} label={label(r.nilGstr1?.status)} demo={r.nilGstr1?.isDemo} />}</div>
              <div className="flex items-center justify-between"><span>GSTR-3B nil</span><FilingStatusBadge status={(r.nilGstr3b?.status ?? "NOT_STARTED") as FilingStatus} label={label(r.nilGstr3b?.status)} demo={r.nilGstr3b?.isDemo} /></div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={`/returns/${r.period.key}`} className="inline-flex h-10 items-center gap-1 rounded-xl bg-brand-50 px-3 text-sm font-semibold text-brand-700">{t("returns_prepare")} <ArrowRight className="size-4" /></Link>
              {r.ended && r.issuedCount === 0 && imported.count === 0 && <Link href={`/returns/${r.period.key}/nil`} className="inline-flex h-10 items-center gap-1 rounded-xl border border-line bg-white px-3 text-sm font-semibold">{t("returns_nil")}</Link>}
            </div>
          </Card>
        );})}
      </div>
    </div>
  );
}
