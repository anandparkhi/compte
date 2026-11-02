import "server-only";
import { prisma } from "../db";
import { AppError } from "../errors";
import { audit } from "../audit";
import type { Ctx } from "../auth/ctx";
import { looksLikeGstnCommand } from "@/lib/domain/gstn-sms";
import { formatINR } from "@/lib/domain/money";
import { stateName } from "@/lib/domain/states";
import { createDraftFromText, discardDraft, getInvoiceView, issueInvoice, shortRef, updateDraft } from "./invoices";

/**
 * Merchant → Compte SMS commands (simulator now, provider webhook later).
 * Completely separate from the GSTN 14409 channel: anything that looks like a GSTN command
 * is rejected and its body is NOT stored (it may contain a government verification code).
 *
 *   BILL <customer> <qty> <unit> <price> [GST<rate>]   -> creates a draft, replies with summary
 *   CONFIRM <ref>                                       -> issues the draft (explicit confirmation)
 *   CANCEL <ref>                                        -> discards the draft
 */
export interface InboundSms {
  channel: "SMS_SIMULATOR" | "SMS_WEBHOOK";
  providerMessageId: string;
  from: string;
  body: string;
}

const normPhone = (p: string) => p.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");

export async function handleInboundSms(msg: InboundSms, simulatorCtx?: Ctx): Promise<{ reply: string; classification: string; invoiceId?: string | null; replayed?: boolean }> {
  const existing = await prisma.inboundMessage.findUnique({ where: { channel_providerMessageId: { channel: msg.channel, providerMessageId: msg.providerMessageId } } });
  if (existing) return { reply: existing.replyText ?? "", classification: existing.classification, invoiceId: existing.invoiceId, replayed: true };

  const store = (data: { businessId: string | null; classification: string; status: string; replyText: string; invoiceId?: string | null; body?: string; bodyRedacted?: boolean }) =>
    prisma.inboundMessage.create({ data: { channel: msg.channel, providerMessageId: msg.providerMessageId, fromNumber: normPhone(msg.from), body: data.body ?? msg.body.slice(0, 500), bodyRedacted: data.bodyRedacted ?? false, businessId: data.businessId, classification: data.classification, status: data.status, replyText: data.replyText, invoiceId: data.invoiceId ?? null } });

  // 1. Never ingest GSTN filing commands/codes.
  if (looksLikeGstnCommand(msg.body)) {
    const reply = "This looks like a GSTN filing SMS. Send it directly to 14409 from your GST-registered mobile. Compte never handles GSTN verification codes.";
    await store({ businessId: simulatorCtx?.businessId ?? null, classification: "GSTN_COMMAND_REJECTED", status: "REJECTED", replyText: reply, body: "[redacted: GSTN 14409 command — not stored]", bodyRedacted: true });
    return { reply, classification: "GSTN_COMMAND_REJECTED" };
  }

  // 2. Resolve the business + acting user.
  let ctx: Ctx | null = simulatorCtx ?? null;
  if (!ctx) {
    const phone = normPhone(msg.from);
    const businesses = await prisma.business.findMany({ where: { phone }, include: { members: { where: { role: { in: ["OWNER", "ACCOUNTANT"] } }, include: { user: true }, take: 1 } } });
    if (businesses.length !== 1 || !businesses[0].members[0]) {
      const reply = "This number is not linked to exactly one business in Compte.";
      await store({ businessId: null, classification: "UNKNOWN_SENDER", status: "REJECTED", replyText: reply });
      return { reply, classification: "UNKNOWN_SENDER" };
    }
    const m = businesses[0].members[0];
    ctx = { userId: m.userId, userName: m.user.name, businessId: businesses[0].id, role: m.role as Ctx["role"] };
  }

  const body = msg.body.trim();
  const confirm = /^(confirm|yes|haan|ho)\s+(d[a-z0-9]{5})$/i.exec(body);
  const cancel = /^(cancel|no)\s+(d[a-z0-9]{5})$/i.exec(body);
  try {
    if (confirm || cancel) {
      const ref = (confirm ?? cancel)![2].toUpperCase();
      const drafts = await prisma.invoice.findMany({ where: { businessId: ctx.businessId, status: "DRAFT", source: "SMS" }, select: { id: true } });
      const draft = drafts.find((d) => shortRef(d.id) === ref);
      if (!draft) {
        const reply = `No pending SMS draft ${ref}.`;
        await store({ businessId: ctx.businessId, classification: confirm ? "CONFIRM_COMMAND" : "CANCEL_COMMAND", status: "REJECTED", replyText: reply });
        return { reply, classification: "CONFIRM_COMMAND" };
      }
      if (cancel) {
        await discardDraft(ctx, draft.id);
        const reply = `Draft ${ref} cancelled.`;
        await store({ businessId: ctx.businessId, classification: "CANCEL_COMMAND", status: "CANCELLED", replyText: reply });
        return { reply, classification: "CANCEL_COMMAND" };
      }
      const view = await getInvoiceView(ctx, draft.id);
      // Replying CONFIRM to a summary that showed the place of supply = explicit POS confirmation.
      if (view.invoice.placeOfSupplySource !== "USER_CONFIRMED" && view.invoice.placeOfSupplyStateCode) {
        await updateDraft(ctx, draft.id, {
          customerId: view.invoice.customerId, invoiceDate: view.invoice.invoiceDate, placeOfSupplyStateCode: view.invoice.placeOfSupplyStateCode, placeOfSupplyConfirmed: true,
          lines: view.invoice.lineItems.map((l) => ({ productId: l.productId, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, gstRate: l.gstRate, priceIncludesTax: l.priceIncludesTax })),
        });
      }
      const fresh = await getInvoiceView(ctx, draft.id);
      const { invoice } = await issueInvoice(ctx, draft.id, { idempotencyKey: `sms:${msg.channel}:${msg.providerMessageId}`, expectedGrandTotal: fresh.computation!.totals.grandTotal, confirm: true });
      const reply = `Invoice ${invoice.invoiceNumber} issued. Total ${formatINR(invoice.grandTotal)}. PDF available in Compte.`;
      await store({ businessId: ctx.businessId, classification: "CONFIRM_COMMAND", status: "ISSUED", replyText: reply, invoiceId: invoice.id });
      return { reply, classification: "CONFIRM_COMMAND", invoiceId: invoice.id };
    }

    if (/^bill\s+/i.test(body)) {
      const inv = await createDraftFromText(ctx, { text: body, source: "SMS" });
      const view = await getInvoiceView(ctx, inv.id);
      const c = view.computation!;
      const ref = shortRef(inv.id);
      const blockers = c.issues.filter((i) => i.severity === "BLOCKER" && i.code !== "POS_UNCONFIRMED");
      const line = view.invoice.lineItems[0];
      const reply = blockers.length
        ? `Draft ${ref} needs attention: ${blockers.map((b) => b.message).join(" ").slice(0, 220)} Open Compte to fix, or reply CANCEL ${ref}.`
        : `Draft ${ref}: ${view.invoice.customer?.name} | ${line.quantity} ${line.unit} x ${formatINR(line.unitPrice)} | GST ${line.gstRate}% | POS ${stateName(view.invoice.placeOfSupplyStateCode)} | Total ${formatINR(c.totals.grandTotal)}. Reply CONFIRM ${ref} to issue or CANCEL ${ref}.`;
      await store({ businessId: ctx.businessId, classification: "INVOICE_COMMAND", status: "DRAFT_CREATED", replyText: reply, invoiceId: inv.id });
      await audit({ businessId: ctx.businessId, userId: ctx.userId, action: "SMS_DRAFT_CREATED", entityType: "Invoice", entityId: inv.id, metadata: { channel: msg.channel } });
      return { reply, classification: "INVOICE_COMMAND", invoiceId: inv.id };
    }
  } catch (e) {
    if (e instanceof AppError) {
      const reply = `Could not process: ${e.message}`.slice(0, 300);
      await store({ businessId: ctx.businessId, classification: "UNPARSEABLE", status: "REJECTED", replyText: reply });
      return { reply, classification: "ERROR" };
    }
    throw e;
  }

  const reply = "Format: BILL <customer> <qty> <unit> <price> GST<rate>. Example: BILL RAMESH 20 BOX 500 GST18";
  await store({ businessId: ctx.businessId, classification: "UNPARSEABLE", status: "REJECTED", replyText: reply });
  return { reply, classification: "UNPARSEABLE" };
}
