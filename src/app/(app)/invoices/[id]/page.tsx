import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageContext } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import { getInvoiceView } from "@/server/services/invoices";
import { listCustomers, listProducts } from "@/server/services/catalog";
import { getT } from "@/lib/i18n/server";
import { Badge, Card, CardTitle, LinkButton, PageHeader } from "@/components/ui";
import { ReviewEditor } from "@/components/invoice/review-editor";
import { InvoicePayments } from "@/components/payment/invoice-payments";
import { InvoiceDocumentActions } from "@/components/invoice/invoice-document-actions";
import { EmailInvoice } from "@/components/invoice/email-invoice";
import { formatINR } from "@/lib/domain/money";
import { formatDateIN, periodForDate, type FilingFrequency } from "@/lib/domain/periods";
import { SELECTABLE_STATES } from "@/lib/domain/states";

export const dynamic = "force-dynamic";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePageContext();
  const { id } = await params;
  let view;
  try { view = await getInvoiceView(ctx, id); } catch (e) { if (e instanceof AppError && e.status === 404) notFound(); throw e; }
  const business = await prisma.business.findUniqueOrThrow({ where: { id: ctx.businessId } });
  const { t } = await getT(business.preferredLanguage);

  if (view.invoice.status === "DRAFT") {
    const [customers, products] = await Promise.all([listCustomers(ctx), listProducts(ctx)]);
    const keys = ["review_title", "review_subtitle", "review_customer", "review_items", "review_pos", "review_pos_confirm", "review_date", "review_confirm", "review_save", "review_discard", "review_issues", "review_warnings", "review_extracted_by", "review_add_line", "review_total", "review_taxable", "confirm_dialog"] as const;
    const labels = Object.fromEntries(keys.map((k) => [k, t(k)])) as Record<(typeof keys)[number], string>;
    return (
      <ReviewEditor
        labels={labels}
        initial={view}
        customers={customers.map((c) => ({ id: c.id, name: c.name, stateCode: c.stateCode, shippingStateCode: c.shippingStateCode, gstin: c.gstin }))}
        products={products.map((p) => ({ id: p.id, name: p.name, hsnSac: p.hsnSac, unit: p.unit, gstRate: p.gstRate, defaultPrice: p.defaultPrice, priceIncludesTax: p.priceIncludesTax, kind: p.kind }))}
        states={SELECTABLE_STATES.map((s) => ({ code: s.code, name: s.name }))}
        supplierStateCode={business.stateCode}
      />
    );
  }

  const s = view.snapshot!;
  const period = periodForDate(s.invoiceDate, business.filingFrequency as FilingFrequency);
  const intra = s.supplyType === "INTRA";
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader
        title={<span className="font-mono">{s.invoiceNumber}</span>}
        subtitle={`${s.recipient.name} · ${formatDateIN(s.invoiceDate)}`}
        actions={undefined}
      />
      <InvoiceDocumentActions invoiceId={id} invoiceNumber={s.invoiceNumber} status={view.invoice.status} canWrite={ctx.role !== "VIEWER"} />
      <div className="flex flex-wrap gap-2">
        <Badge tone={view.invoice.status === "CANCELLED" ? "warn" : "brand"}>{view.invoice.status === "CANCELLED" ? "Cancelled" : t("status_ISSUED")}</Badge>
        <Badge>{intra ? "Intra-state · CGST + " + s.stateTaxLabel : "Inter-state · IGST"}</Badge>
        <Badge>Place of supply: {s.placeOfSupply.stateName} ({s.placeOfSupply.stateCode})</Badge>
        {s.isDemo && <Badge tone="demo">DEMO DATA</Badge>}
      </div>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-canvas text-left text-xs uppercase tracking-wide text-muted">
            <tr><th className="px-4 py-3">Item</th><th className="px-2 py-3">HSN/SAC</th><th className="px-2 py-3 text-right">Qty</th><th className="px-2 py-3 text-right">Rate</th><th className="px-2 py-3 text-right">Taxable</th><th className="px-2 py-3 text-right">GST</th><th className="px-4 py-3 text-right">Total</th></tr>
          </thead>
          <tbody className="tabular divide-y divide-line">
            {s.lines.map((l) => (
              <tr key={l.position}>
                <td className="px-4 py-3 font-medium">{l.description}</td><td className="px-2 py-3 font-mono">{l.hsnSac}</td>
                <td className="px-2 py-3 text-right">{l.quantity} {l.unit}</td><td className="px-2 py-3 text-right">{formatINR(l.unitPrice)}</td>
                <td className="px-2 py-3 text-right">{formatINR(l.taxableValue)}</td>
                <td className="px-2 py-3 text-right">{l.gstRate}%<br /><span className="text-xs text-muted">{intra ? `${formatINR(l.cgst)} + ${formatINR(l.sgst)}` : formatINR(l.igst)}</span></td>
                <td className="px-4 py-3 text-right font-semibold">{formatINR(l.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="tabular space-y-1 border-t border-line px-4 py-3 text-sm sm:ml-auto sm:w-80">
          <div className="flex justify-between"><dt>Taxable value</dt><dd>{formatINR(s.totals.taxableTotal)}</dd></div>
          {intra ? <><div className="flex justify-between"><dt>CGST</dt><dd>{formatINR(s.totals.cgstTotal)}</dd></div><div className="flex justify-between"><dt>{s.stateTaxLabel}</dt><dd>{formatINR(s.totals.sgstTotal)}</dd></div></>
            : <div className="flex justify-between"><dt>IGST</dt><dd>{formatINR(s.totals.igstTotal)}</dd></div>}
          <div className="flex justify-between border-t border-line pt-2 text-base font-bold"><dt>Grand total</dt><dd>{formatINR(s.totals.grandTotal)}</dd></div>
        </dl>
      </Card>
      {view.invoice.status === "ISSUED" && <InvoicePayments invoiceId={id} canWrite={ctx.role !== "VIEWER"} />}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardTitle className="mb-2">Books & returns</CardTitle>
          <p className="text-sm text-muted">{view.invoice.status === "CANCELLED" ? "This invoice was cancelled and excluded from active sales and return preparation, but its original record remains in the audit ledger." : <>Recorded in the sales ledger and included in GSTR-1 preparation for <b className="text-ink">{period.label}</b>.</>}</p>
          <Link className="mt-2 inline-block text-sm font-semibold text-brand-700" href={`/returns/${period.key}`}>Open {period.label} return preparation →</Link>
          <p className="mt-3 text-xs text-muted">Issued values are locked. Integrity hash: <span className="font-mono">{view.invoice.snapshotHash?.slice(0, 16)}…</span></p>
        </Card>
        {view.invoice.status === "ISSUED" && <EmailInvoice invoiceId={id} defaultTo={(await prisma.customer.findFirst({ where: { id: view.invoice.customerId ?? "", businessId: ctx.businessId } }))?.email ?? ""} label={t("invoice_email")}
          history={view.emails.map((e) => ({ id: e.id, to: e.toAddress, status: e.status, at: e.createdAt.toISOString() }))} />}
      </div>
    </div>
  );
}
