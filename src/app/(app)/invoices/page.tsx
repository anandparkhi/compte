import Link from "next/link";
import { Plus } from "lucide-react";
import { requirePageContext } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { readHistorical } from "@/server/services/historical-records";
import { listInvoices } from "@/server/services/invoices";
import { listCustomers } from "@/server/services/catalog";
import { getT } from "@/lib/i18n/server";
import { Badge, Card, Empty, LinkButton, PageHeader } from "@/components/ui";
import { formatINR } from "@/lib/domain/money";
import { formatDateIN } from "@/lib/domain/periods";

export const dynamic = "force-dynamic";

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ status?: string; customer?: string }> }) {
  const ctx = await requirePageContext();
  const sp = await searchParams;
  const b = await prisma.business.findUniqueOrThrow({ where: { id: ctx.businessId } });
  const { t } = await getT(b.preferredLanguage);
  const status = sp.status === "DRAFT" || sp.status === "ISSUED" ? sp.status : undefined;
  const [rows, customers, historical] = await Promise.all([listInvoices(ctx, { status, customerId: sp.customer }), listCustomers(ctx), readHistorical(ctx.businessId)]);
  const q = (s?: string, c?: string) => { const p = new URLSearchParams(); if (s) p.set("status", s); if (c) p.set("customer", c); const str = p.toString(); return `/invoices${str ? `?${str}` : ""}`; };
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader title={t("invoices_title")} subtitle="Sales ledger — every issued invoice, newest first." actions={<LinkButton href="/invoices/new"><Plus className="size-4" />{t("nav_create")}</LinkButton>} />
      <div className="flex flex-wrap gap-2">
        {[{ k: undefined, l: "All" }, { k: "ISSUED", l: t("status_ISSUED") }, { k: "DRAFT", l: t("status_DRAFT") }].map((f) => (
          <Link key={f.l} href={q(f.k, sp.customer)} className={`rounded-full px-3 py-1.5 text-sm font-medium ${status === f.k ? "bg-ink text-white" : "bg-white ring-1 ring-line"}`}>{f.l}</Link>
        ))}
        <span className="mx-1 w-px bg-line" />
        {customers.map((c) => (
          <Link key={c.id} href={q(status, sp.customer === c.id ? undefined : c.id)} className={`rounded-full px-3 py-1.5 text-sm font-medium ${sp.customer === c.id ? "bg-brand-600 text-white" : "bg-white ring-1 ring-line"}`}>{c.name}</Link>
        ))}
      </div>
      {(!status || status === "ISSUED") && !sp.customer && <Card>
        <h2 className="mb-2 font-semibold">Historical invoices from GST imports</h2>
        <p className="mb-3 text-xs text-muted">Read-only evidence, not newly issued invoices. Amounts are not counted twice.</p>
        {historical.invoices.length ? <ul className="divide-y divide-line">{historical.invoices.map(i=><li key={i.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm"><div><b>{i.number}</b> · {i.date} · GSTIN {i.recipientGstin}<p className="text-xs text-muted">Imported · period {i.periodKey}</p></div><b>{formatINR(i.value.toFixed(2))}</b></li>)}</ul> : <p className="text-sm text-muted">No imported invoices yet.</p>}
      </Card>}
      {rows.length === 0 ? <Empty>No invoices match.</Empty> : (
        <Card className="p-0">
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={`/invoices/${r.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-canvas">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{r.customer?.name ?? "No customer yet"}</p>
                    <p className="text-xs text-muted">
                      {r.invoiceNumber ? <span className="font-mono">{r.invoiceNumber}</span> : "Draft"} · {formatDateIN(r.invoiceDate)} · {r.source.toLowerCase()}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="tabular font-semibold">{formatINR(r.grandTotal)}</p>
                    <Badge tone={r.status === "ISSUED" ? "brand" : "warn"}>{r.status === "ISSUED" ? t("status_ISSUED") : t("status_DRAFT")}</Badge>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
