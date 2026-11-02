import Link from "next/link";
import { ArrowRight, Landmark, Mic } from "lucide-react";
import { requirePageContext } from "@/server/auth/session";
import { dashboard } from "@/server/services/dashboard";
import { getT } from "@/lib/i18n/server";
import { Badge, Card, CardTitle, Empty, LinkButton, PageHeader, Stat } from "@/components/ui";
import { formatINR } from "@/lib/domain/money";
import { parsePeriodKey, periodKeyFor } from "@/lib/domain/periods";
import { FilingStatusBadge } from "@/components/filing-status-badge";
import type { FilingStatus } from "@/lib/domain/filing-state";

export const dynamic = "force-dynamic";

const ACTION_LABEL: Record<string, string> = {
  INVOICE_ISSUED: "Invoice issued", INVOICE_DRAFT_CREATED: "Draft created", INVOICE_DRAFT_UPDATED: "Draft edited", INVOICE_DRAFT_DISCARDED: "Draft discarded",
  CUSTOMER_CREATED: "Customer added", PRODUCT_CREATED: "Product added", PRODUCT_UPDATED: "Product tax settings changed", NIL_FILING_STATUS: "Nil filing updated",
  NIL_FILING_CREATED: "Nil filing started", INVOICE_EMAILED: "Invoice emailed", INVOICE_EMAIL_NOT_SENT: "Email not sent (provider not configured)", GSTR1_INTERNAL_DRAFT_EXPORTED: "GSTR-1 internal draft exported",
  SMS_DRAFT_CREATED: "Draft from SMS", BUSINESS_ONBOARDED: "Business set up", BUSINESS_UPDATED: "Business details updated",
};

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const ctx = await requirePageContext();
  const sp = await searchParams;
  const d = await dashboard(ctx, sp.period);
  const { t } = await getT(d.business.preferredLanguage);
  const months = Array.from({ length: 12 }, (_, i) => {
    const base = new Date(`${d.period.start}T00:00:00Z`);
    base.setUTCMonth(base.getUTCMonth() - 5 + i);
    return parsePeriodKey(periodKeyFor(base.getUTCFullYear(), base.getUTCMonth() + 1), "MONTHLY");
  });
  const lastKey = d.lastEndedPeriod.key;
  const lastFilings = d.filings.filter((f) => f.periodKey === lastKey && !f.isDemo);

  return (
    <div className="space-y-7">
      <PageHeader title={t("dash_title")} subtitle={`${t("dash_period")}: ${d.period.label}`} />

      <Link href="/invoices/new" className="group relative flex items-center gap-5 overflow-hidden rounded-[26px] bg-[#193e32] p-7 text-white shadow-[0_24px_50px_-28px_rgba(17,53,41,.6)] transition-all hover:bg-[#235541] sm:p-9">
        <span className="grid size-16 shrink-0 place-items-center rounded-2xl border border-white/20 bg-white/10"><Mic className="size-7" aria-hidden /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-2xl font-semibold tracking-[-0.04em]">{t("dash_create_big")}</span>
          <span className="block text-sm text-white/85">{t("dash_create_hint")}</span>
        </span>
        <ArrowRight className="size-6 shrink-0" aria-hidden />
      </Link>

      <nav className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" aria-label="Choose month">
        {months.map((m) => (
          <Link key={m.key} href={`/?period=${m.key}`} className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ${m.key === d.period.key ? "bg-ink text-white" : "bg-white text-ink ring-1 ring-line"}`}>{m.label}</Link>
        ))}
      </nav>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label={t("dash_total_sales")} value={formatINR(d.totals.taxable)} note={`${formatINR(d.totals.invoiceValue)} incl. GST`} />
        <Stat label={t("dash_issued")} value={d.totals.issuedCount} />
        <Stat label={t("dash_gst_collected")} value={formatINR(d.totals.gst)} note={t("dash_gst_note")} />
        <Link href="/invoices?status=DRAFT"><Stat label={t("dash_drafts")} value={d.totals.draftCount} note="All open drafts" /></Link>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <CardTitle>{t("dash_returns_status")}</CardTitle>
            <LinkButton href="/returns" variant="secondary" size="sm"><Landmark className="size-4" />{t("nav_returns")}</LinkButton>
          </div>
          <p className="mb-3 text-sm text-muted">Last completed period: <b className="text-ink">{d.lastEndedPeriod.label}</b></p>
          <div className="space-y-2">
            {(["GSTR1", "GSTR3B"] as const).map((rt) => {
              const f = lastFilings.find((x) => x.returnType === rt);
              return (
                <div key={rt} className="flex items-center justify-between rounded-xl bg-canvas px-3 py-2.5">
                  <span className="text-sm font-semibold">{rt === "GSTR1" ? "GSTR-1" : "GSTR-3B"} nil filing</span>
                  <FilingStatusBadge status={(f?.status ?? "NOT_STARTED") as FilingStatus} label={t(`fs_${f?.status ?? "NOT_STARTED"}` as Parameters<typeof t>[0])} />
                </div>
              );
            })}
          </div>
          <Link href={`/returns/${lastKey}`} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-700">Open {d.lastEndedPeriod.label} <ArrowRight className="size-4" /></Link>
        </Card>

        <Card>
          <CardTitle className="mb-3">{t("dash_customers_top")}</CardTitle>
          {d.customers.length ? (
            <ul className="divide-y divide-line">
              {d.customers.map((c) => (
                <li key={c.name} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="font-medium">{c.name} <span className="text-muted">· {c.count} inv.</span></span>
                  <span className="tabular font-semibold">{formatINR(c.taxable)}</span>
                </li>
              ))}
            </ul>
          ) : <Empty>No issued invoices in {d.period.label}.</Empty>}
        </Card>
      </div>

      <Card>
        <CardTitle className="mb-3">{t("dash_recent")}</CardTitle>
        {d.recent.length ? (
          <ul className="divide-y divide-line">
            {d.recent.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="min-w-0 truncate">
                  {ACTION_LABEL[r.action] ?? r.action}
                  {typeof r.metadata.invoiceNumber === "string" && <Badge tone="brand" className="ml-2 font-mono">{r.metadata.invoiceNumber}</Badge>}
                  {typeof r.metadata.to === "string" && r.entityType === "NilReturnFiling" && <Badge className="ml-2">{String(r.metadata.to).replace(/_/g, " ").toLowerCase()}</Badge>}
                </span>
                <time className="shrink-0 text-xs text-muted">{r.createdAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</time>
              </li>
            ))}
          </ul>
        ) : <Empty>No activity yet.</Empty>}
      </Card>
    </div>
  );
}
