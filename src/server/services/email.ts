import "server-only";
import { z } from "zod";
import { prisma } from "../db";
import { audit } from "../audit";
import { env } from "../env";
import { assertCanWrite, type Ctx } from "../auth/ctx";
import { rateLimit } from "../rate-limit";
import { getInvoiceForDocument } from "./invoices";
import { renderInvoicePdf } from "./pdf";
import { formatINR } from "@/lib/domain/money";
import { formatDateIN } from "@/lib/domain/periods";
import { brand } from "@/lib/config/brand";

const EmailInput = z.object({ to: z.string().trim().email() });

/**
 * Sends the issued invoice PDF via Resend's REST API. Without credentials, nothing is sent:
 * the attempt is recorded as NOT_SENT_PROVIDER_NOT_CONFIGURED and a preview is returned.
 */
export async function emailInvoice(ctx: Ctx, invoiceId: string, raw: unknown, fetchImpl: typeof fetch = fetch) {
  assertCanWrite(ctx);
  rateLimit(`email:${ctx.businessId}`, 30, 60 * 60 * 1000);
  const { to } = EmailInput.parse(raw);
  const { invoice, snapshot: s } = await getInvoiceForDocument(ctx, invoiceId);
  const subject = `Tax Invoice ${s.invoiceNumber} from ${s.supplier.legalName}`;
  const html = `<p>Dear ${escapeHtml(s.recipient.name)},</p><p>Please find attached tax invoice <b>${escapeHtml(s.invoiceNumber)}</b> dated ${formatDateIN(s.invoiceDate)} for <b>${formatINR(s.totals.grandTotal)}</b>.</p><p>Regards,<br/>${escapeHtml(s.supplier.legalName)}<br/>GSTIN ${s.supplier.gstin}</p><p style="color:#888;font-size:12px">Sent with ${brand.name}</p>`;
  const filename = `${s.invoiceNumber.replace(/\//g, "-")}.pdf`;

  if (!env.resendApiKey || !env.emailFrom) {
    const row = await prisma.emailDelivery.create({ data: { businessId: ctx.businessId, invoiceId: invoice.id, toAddress: to, provider: "NOT_CONFIGURED", status: "NOT_SENT_PROVIDER_NOT_CONFIGURED", requestedByUserId: ctx.userId, errorMessage: "RESEND_API_KEY / EMAIL_FROM not set" } });
    await audit({ businessId: ctx.businessId, userId: ctx.userId, action: "INVOICE_EMAIL_NOT_SENT", entityType: "Invoice", entityId: invoice.id, metadata: { reason: "provider_not_configured" } });
    return { delivered: false, status: row.status, preview: { to, subject, html, attachment: filename } };
  }

  const pdf = await renderInvoicePdf(s);
  let status = "FAILED", providerMessageId: string | null = null, providerResponse = "", errorMessage: string | null = null;
  try {
    const res = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.emailFrom, to: [to], subject, html, attachments: [{ filename, content: pdf.toString("base64") }] }),
    });
    providerResponse = (await res.text()).slice(0, 2000);
    if (res.ok) {
      status = "SENT";
      providerMessageId = (JSON.parse(providerResponse) as { id?: string }).id ?? null;
    } else errorMessage = `Provider returned HTTP ${res.status}`;
  } catch (e) {
    errorMessage = e instanceof Error ? e.message.slice(0, 300) : "network error";
  }
  const row = await prisma.emailDelivery.create({ data: { businessId: ctx.businessId, invoiceId: invoice.id, toAddress: to, provider: "RESEND", status, providerMessageId, providerResponse, errorMessage, requestedByUserId: ctx.userId } });
  await audit({ businessId: ctx.businessId, userId: ctx.userId, action: status === "SENT" ? "INVOICE_EMAILED" : "INVOICE_EMAIL_FAILED", entityType: "Invoice", entityId: invoice.id, metadata: { provider: "RESEND", status } });
  return { delivered: status === "SENT", status: row.status, error: errorMessage };
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
