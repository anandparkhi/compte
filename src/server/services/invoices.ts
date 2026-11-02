import "server-only";
import { createHash } from "node:crypto";
import { prisma, type Tx } from "../db";
import { AppError, notFound } from "../errors";
import { audit } from "../audit";
import { assertCanWrite, type Ctx } from "../auth/ctx";
import { DraftUpdateInput, IssueInput } from "@/lib/schemas";
import { computeDraft, type DraftComputation, type RuleProduct } from "@/lib/domain/invoice-rules";
import { formatInvoiceNumber } from "@/lib/domain/invoice-number";
import { amountInWords } from "@/lib/domain/money";
import { dateOnly, financialYearOf, periodForDate, toDateString, todayIST, type FilingFrequency } from "@/lib/domain/periods";
import { getState, stateName, stateTaxLabel } from "@/lib/domain/states";
import { COMMITTED_STATUSES, STATUS_LABEL, type FilingStatus } from "@/lib/domain/filing-state";
import type { ParsedIntent } from "@/lib/nlp/types";
import { loadCatalog } from "./catalog";
import { extractIntent } from "./extraction";

let clock: () => string = () => todayIST();
/** Test hook for deterministic "today" */
export function setTodayForTests(fn: (() => string) | null) {
  clock = fn ?? (() => todayIST());
}
export const today = () => clock();

// ---------------------------------------------------------------------------
// Loading & computing
// ---------------------------------------------------------------------------
async function loadDraftContext(businessId: string, invoiceId: string, db: Tx | typeof prisma = prisma) {
  const invoice = await db.invoice.findFirst({ where: { id: invoiceId, businessId }, include: { lineItems: { orderBy: { position: "asc" } }, customer: true } });
  if (!invoice) throw notFound("Invoice");
  const business = await db.business.findUniqueOrThrow({ where: { id: businessId } });
  const productIds = invoice.lineItems.map((l) => l.productId).filter((x): x is string => !!x);
  const products = await db.product.findMany({ where: { businessId, id: { in: productIds } } });
  return { invoice, business, products: new Map<string, RuleProduct>(products.map((p) => [p.id, p])) };
}

/** A nil GSTR-1 for the invoice's period that is in progress/filed blocks new invoices in that period. */
export async function nilConflictFor(businessId: string, frequency: FilingFrequency, invoiceDate: string, db: Tx | typeof prisma = prisma): Promise<string | null> {
  let period;
  try { period = periodForDate(invoiceDate, frequency); } catch { return null; }
  const f = await db.nilReturnFiling.findFirst({ where: { businessId, returnType: "GSTR1", periodKey: period.key, isDemo: false, status: { in: COMMITTED_STATUSES } } });
  return f ? `A nil GSTR-1 for ${period.label} is “${STATUS_LABEL[f.status as FilingStatus]}”. Issuing an invoice dated in that period would contradict it — talk to your accountant (an amendment may be needed).` : null;
}

function compute(ctxData: Awaited<ReturnType<typeof loadDraftContext>>, nilConflict: string | null): DraftComputation {
  const { invoice, business, products } = ctxData;
  return computeDraft(
    {
      customerId: invoice.customerId,
      invoiceDate: toDateString(invoice.invoiceDate),
      placeOfSupplyStateCode: invoice.placeOfSupplyStateCode,
      placeOfSupplySource: invoice.placeOfSupplySource,
      lines: invoice.lineItems.map((l) => ({ productId: l.productId, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, gstRate: l.gstRate, priceIncludesTax: l.priceIncludesTax })),
    },
    { business, customer: invoice.customer, products, today: today(), nilConflict },
  );
}

export async function getInvoiceView(ctx: Ctx, invoiceId: string) {
  const data = await loadDraftContext(ctx.businessId, invoiceId);
  const { invoice, business } = data;
  const nil = invoice.status === "DRAFT" ? await nilConflictFor(ctx.businessId, business.filingFrequency as FilingFrequency, toDateString(invoice.invoiceDate)) : null;
  const computation = invoice.status === "DRAFT" ? compute(data, nil) : null;
  const emails = await prisma.emailDelivery.findMany({ where: { businessId: ctx.businessId, invoiceId }, orderBy: { createdAt: "desc" } });
  return {
    invoice: { ...invoice, invoiceDate: toDateString(invoice.invoiceDate), extractionNotes: safeJson<string[]>(invoice.extractionNotes, []) },
    business: { stateCode: business.stateCode, gstin: business.gstin, legalName: business.legalName },
    computation,
    snapshot: invoice.snapshot ? (JSON.parse(invoice.snapshot) as InvoiceSnapshot) : null,
    emails,
    shortRef: shortRef(invoice.id),
  };
}

function safeJson<T>(s: string | null | undefined, fallback: T): T {
  try { return s ? (JSON.parse(s) as T) : fallback; } catch { return fallback; }
}

export const shortRef = (id: string) => `D${id.slice(-5).toUpperCase()}`;

// ---------------------------------------------------------------------------
// Draft creation from text / intent
// ---------------------------------------------------------------------------
export async function createDraftFromText(ctx: Ctx, args: { text: string; language?: string; source: "TEXT" | "VOICE" | "SMS"; inboundMessageId?: string }) {
  assertCanWrite(ctx);
  const catalog = await loadCatalog(ctx.businessId);
  const intent = await extractIntent(args.text, catalog, args.language === "auto" ? undefined : args.language);
  return createDraftFromIntent(ctx, intent, args);
}

export async function createDraftFromIntent(ctx: Ctx, intent: ParsedIntent, args: { text: string; source: "TEXT" | "VOICE" | "SMS" | "MANUAL"; inboundMessageId?: string }) {
  assertCanWrite(ctx);
  const business = await prisma.business.findUniqueOrThrow({ where: { id: ctx.businessId } });
  const notes = [...intent.notes];
  if (intent.intent !== "CREATE_INVOICE") notes.unshift("This did not look like a sale. Fill in the details below or try rephrasing.");

  const customer = intent.customer.matchedId ? await prisma.customer.findFirst({ where: { id: intent.customer.matchedId, businessId: ctx.businessId } }) : null;
  if (!customer) {
    if (intent.customer.confidence === "AMBIGUOUS" && intent.customer.candidates.length) {
      const names = await prisma.customer.findMany({ where: { id: { in: intent.customer.candidates }, businessId: ctx.businessId }, select: { name: true } });
      notes.push(`Which customer? Could be: ${names.map((n) => n.name).join(", ")}.`);
    } else if (intent.customer.mention) notes.push(`Customer “${intent.customer.mention}” is not in your customer list — select one or add a new customer.`);
    else notes.push("No customer was mentioned — select one.");
  }

  const productIds = intent.items.map((i) => i.product.matchedId).filter((x): x is string => !!x);
  const products = new Map((await prisma.product.findMany({ where: { businessId: ctx.businessId, id: { in: productIds } } })).map((p) => [p.id, p]));

  const lines = intent.items.map((it, idx) => {
    const p = it.product.matchedId ? products.get(it.product.matchedId) : undefined;
    if (!p) {
      if (it.product.confidence === "AMBIGUOUS") notes.push(`Item ${idx + 1}: more than one product matches “${it.product.mention ?? it.unitMention ?? ""}” — choose one.`);
      else notes.push(`Item ${idx + 1}: product “${it.product.mention ?? it.unitMention ?? "?"}” not found in your catalog — choose a product.`);
    }
    if (!it.quantity) notes.push(`Item ${idx + 1}: quantity was not understood — please enter it.`);
    let unitPrice = it.unitPrice ?? "";
    if (!it.unitPrice && p) { unitPrice = p.defaultPrice; notes.push(`Item ${idx + 1}: no price mentioned — using the product's default price ₹${p.defaultPrice}.`); }
    const rate = intent.gstRate ?? p?.gstRate ?? "";
    if (!intent.gstRate && p) notes.push(`Item ${idx + 1}: GST rate ${p.gstRate}% taken from your product settings.`);
    const priceIncludesTax = intent.taxInclusion ? intent.taxInclusion === "INCLUSIVE" : p?.priceIncludesTax ?? false;
    if (!intent.taxInclusion) notes.push(`Prices treated as ${priceIncludesTax ? "including" : "excluding"} GST (product default) — change if needed.`);
    return {
      position: idx + 1,
      productId: p?.id ?? null,
      description: p?.name ?? it.product.mention ?? it.unitMention ?? "",
      hsnSac: p?.hsnSac ?? "",
      unit: p?.unit ?? "",
      quantity: it.quantity ?? "",
      unitPrice,
      priceIncludesTax,
      gstRate: rate,
    };
  });

  const posCode = suggestPlaceOfSupply(customer, lines.every((l) => (l.productId ? products.get(l.productId)?.kind === "SERVICES" : false)));
  const invoice = await prisma.invoice.create({
    data: {
      businessId: ctx.businessId,
      status: "DRAFT",
      invoiceDate: dateOnly(today()),
      customerId: customer?.id ?? null,
      placeOfSupplyStateCode: posCode,
      placeOfSupplySource: posCode ? "AUTO_SUGGESTED" : null,
      source: args.source,
      sourceText: args.text.slice(0, 1000),
      sourceLanguage: intent.language,
      extractionMethod: intent.method,
      extractionNotes: JSON.stringify([...new Set(notes)]),
      inboundMessageId: args.inboundMessageId ?? null,
      createdByUserId: ctx.userId,
      lineItems: { create: lines },
    },
  });
  await refreshDraftTotals(ctx.businessId, invoice.id);
  await audit({ businessId: ctx.businessId, userId: ctx.userId, action: "INVOICE_DRAFT_CREATED", entityType: "Invoice", entityId: invoice.id, metadata: { source: args.source, method: intent.method, language: intent.language } });
  return invoice;
}

/** Goods: where delivery terminates (ship-to state). B2B services: recipient's registered state. Always needs user confirmation. */
export function suggestPlaceOfSupply(customer: { stateCode: string; shippingStateCode: string | null } | null, servicesOnly: boolean): string | null {
  if (!customer) return null;
  return servicesOnly ? customer.stateCode : customer.shippingStateCode ?? customer.stateCode;
}

async function refreshDraftTotals(businessId: string, invoiceId: string) {
  const data = await loadDraftContext(businessId, invoiceId);
  if (data.invoice.status !== "DRAFT") return;
  const c = compute(data, null);
  await prisma.invoice.update({ where: { id: invoiceId }, data: { ...c.totals, supplyType: c.supplyType } });
}

// ---------------------------------------------------------------------------
// Editing / discarding drafts
// ---------------------------------------------------------------------------
export async function updateDraft(ctx: Ctx, invoiceId: string, raw: unknown) {
  assertCanWrite(ctx);
  const input = DraftUpdateInput.parse(raw);
  const inv = await prisma.invoice.findFirst({ where: { id: invoiceId, businessId: ctx.businessId } });
  if (!inv) throw notFound("Invoice");
  if (inv.status !== "DRAFT") throw new AppError(409, "INVOICE_IMMUTABLE", "Issued invoices cannot be edited. Issue a credit/debit note instead (not yet supported).");
  if (input.customerId && !(await prisma.customer.findFirst({ where: { id: input.customerId, businessId: ctx.businessId } }))) throw notFound("Customer");
  const productIds = input.lines.map((l) => l.productId).filter((x): x is string => !!x);
  const products = await prisma.product.findMany({ where: { businessId: ctx.businessId, id: { in: productIds } } });
  if (products.length !== new Set(productIds).size) throw notFound("Product");
  const byId = new Map(products.map((p) => [p.id, p]));
  if (input.placeOfSupplyStateCode && !getState(input.placeOfSupplyStateCode)) throw new AppError(422, "INVALID_POS", "Invalid place of supply");

  await prisma.$transaction(async (tx) => {
    await tx.invoiceLineItem.deleteMany({ where: { invoiceId } });
    await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        customerId: input.customerId,
        invoiceDate: dateOnly(input.invoiceDate),
        placeOfSupplyStateCode: input.placeOfSupplyStateCode,
        placeOfSupplySource: input.placeOfSupplyStateCode ? (input.placeOfSupplyConfirmed ? "USER_CONFIRMED" : "AUTO_SUGGESTED") : null,
        lineItems: {
          create: input.lines.map((l, i) => {
            const p = l.productId ? byId.get(l.productId) : undefined;
            return {
              position: i + 1,
              productId: p?.id ?? null,
              description: l.description,
              hsnSac: p?.hsnSac ?? "", // HSN/SAC always comes from the product, never free text
              unit: p?.unit ?? "",
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              priceIncludesTax: l.priceIncludesTax,
              gstRate: l.gstRate,
            };
          }),
        },
      },
    });
  });
  await refreshDraftTotals(ctx.businessId, invoiceId);
  await audit({ businessId: ctx.businessId, userId: ctx.userId, action: "INVOICE_DRAFT_UPDATED", entityType: "Invoice", entityId: invoiceId });
  return getInvoiceView(ctx, invoiceId);
}

export async function discardDraft(ctx: Ctx, invoiceId: string) {
  assertCanWrite(ctx);
  const inv = await prisma.invoice.findFirst({ where: { id: invoiceId, businessId: ctx.businessId } });
  if (!inv) throw notFound("Invoice");
  if (inv.status !== "DRAFT") throw new AppError(409, "INVOICE_IMMUTABLE", "Issued invoices cannot be deleted");
  await prisma.invoice.delete({ where: { id: invoiceId } });
  await audit({ businessId: ctx.businessId, userId: ctx.userId, action: "INVOICE_DRAFT_DISCARDED", entityType: "Invoice", entityId: invoiceId });
}

/** Drafts can be deleted. Issued invoices may only be cancelled, with their number and
 * original snapshot retained. Payments and sent invoices require a formal adjustment. */
export async function removeInvoice(ctx: Ctx, invoiceId: string) {
  assertCanWrite(ctx);
  return prisma.$transaction(async tx => {
    // PostgreSQL row lock prevents concurrent delete/cancel requests.
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Invoice" WHERE "id" = ${invoiceId} AND "businessId" = ${ctx.businessId} FOR UPDATE`;
    if (!rows.length) throw notFound("Invoice");
    const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    if (invoice.status === "DRAFT") {
      await tx.invoice.delete({ where: { id: invoiceId } });
      await audit({businessId:ctx.businessId,userId:ctx.userId,action:"INVOICE_DRAFT_DELETED",entityType:"Invoice",entityId:invoiceId},tx);
      return { action:"DELETED" as const };
    }
    if (invoice.status === "CANCELLED") throw new AppError(409,"ALREADY_CANCELLED","This invoice was already cancelled.");
    if (invoice.status !== "ISSUED") throw new AppError(409,"INVALID_STATUS","This invoice cannot be deleted.");
    const [payments, sent] = await Promise.all([
      tx.invoicePayment.count({where:{businessId:ctx.businessId,invoiceId}}),
      tx.emailDelivery.count({where:{businessId:ctx.businessId,invoiceId,status:"SENT"}}),
    ]);
    if (payments > 0) throw new AppError(409,"PAYMENT_EXISTS","This invoice has recorded payments. Reconcile the payment and use a formal credit note or accountant-assisted correction instead.");
    if (sent > 0) throw new AppError(409,"ALREADY_SENT","This invoice was emailed to a customer. Do not cancel it silently; use a credit note or consult your accountant.");
    // The original invoice number, snapshot and integrity hash remain unchanged.
    await tx.invoice.update({where:{id:invoiceId},data:{status:"CANCELLED"}});
    await audit({businessId:ctx.businessId,userId:ctx.userId,action:"INVOICE_CANCELLED",entityType:"Invoice",entityId:invoiceId,metadata:{invoiceNumber:invoice.invoiceNumber,grandTotal:invoice.grandTotal}},tx);
    return { action:"CANCELLED" as const };
  });
}

// ---------------------------------------------------------------------------
// Issuance
// ---------------------------------------------------------------------------
export interface InvoiceSnapshot {
  schemaVersion: 1;
  documentTitle: "Tax Invoice";
  supplier: { legalName: string; tradeName: string | null; gstin: string; address: string; stateCode: string; stateName: string; phone: string; email: string };
  recipient: { name: string; gstin: string | null; registrationStatus: string; billingAddress: string; stateCode: string; stateName: string; shippingAddress: string | null; shippingStateCode: string | null };
  invoiceNumber: string;
  invoiceDate: string;
  financialYear: string;
  placeOfSupply: { stateCode: string; stateName: string };
  supplyType: "INTRA" | "INTER";
  stateTaxLabel: "SGST" | "UTGST";
  reverseCharge: false;
  lines: { position: number; description: string; hsnSac: string; unit: string; quantity: string; unitPrice: string; priceIncludesTax: boolean; gstRate: string; taxableValue: string; cgst: string; sgst: string; igst: string; lineTotal: string }[];
  totals: { taxableTotal: string; cgstTotal: string; sgstTotal: string; igstTotal: string; grandTotal: string };
  amountInWords: string;
  signatory: { name: string; designation: string };
  issuedAt: string;
  isDemo: boolean;
}

export async function issueInvoice(ctx: Ctx, invoiceId: string, raw: unknown) {
  assertCanWrite(ctx);
  const input = IssueInput.parse(raw);

  // Idempotent replay: the same confirmation key returns the already-issued invoice.
  const replay = await prisma.invoice.findFirst({ where: { businessId: ctx.businessId, idempotencyKey: input.idempotencyKey } });
  if (replay) {
    if (replay.id !== invoiceId) throw new AppError(409, "IDEMPOTENCY_KEY_REUSED", "This confirmation key was already used for another invoice");
    return { invoice: replay, replayed: true };
  }

  const result = await prisma.$transaction(async (tx) => {
    const data = await loadDraftContext(ctx.businessId, invoiceId, tx);
    const { invoice, business } = data;
    if (invoice.status !== "DRAFT") throw new AppError(409, "ALREADY_ISSUED", `Invoice already issued as ${invoice.invoiceNumber}`, { invoiceNumber: invoice.invoiceNumber });
    const invDate = toDateString(invoice.invoiceDate);
    const nil = await nilConflictFor(ctx.businessId, business.filingFrequency as FilingFrequency, invDate, tx);
    const c = compute(data, nil);
    if (!c.canIssue) throw new AppError(422, "INVOICE_NOT_READY", "Resolve the listed problems before issuing", { issues: c.issues.filter((i) => i.severity === "BLOCKER") });
    if (c.totals.grandTotal !== input.expectedGrandTotal) throw new AppError(409, "STALE_CONFIRMATION", `The total changed to ₹${c.totals.grandTotal} since you reviewed it. Please review again.`);

    const fy = financialYearOf(invDate);
    const seq = await tx.invoiceNumberSequence.upsert({
      where: { businessId_financialYear: { businessId: ctx.businessId, financialYear: fy } },
      create: { businessId: ctx.businessId, financialYear: fy, prefix: business.invoicePrefix, nextNumber: 2 },
      update: { nextNumber: { increment: 1 } },
    });
    const serial = seq.nextNumber - 1;
    const invoiceNumber = formatInvoiceNumber(seq.prefix, fy, serial);
    const customer = invoice.customer!;
    const issuedAt = new Date();
    const snapshot: InvoiceSnapshot = {
      schemaVersion: 1,
      documentTitle: "Tax Invoice",
      supplier: { legalName: business.legalName, tradeName: business.tradeName, gstin: business.gstin, address: `${business.addressLine}, ${business.city} - ${business.pincode}`, stateCode: business.stateCode, stateName: stateName(business.stateCode), phone: business.phone, email: business.email },
      recipient: { name: customer.name, gstin: customer.gstin, registrationStatus: customer.registrationStatus, billingAddress: customer.billingAddress, stateCode: customer.stateCode, stateName: stateName(customer.stateCode), shippingAddress: customer.shippingAddress, shippingStateCode: customer.shippingStateCode },
      invoiceNumber, invoiceDate: invDate, financialYear: fy,
      placeOfSupply: { stateCode: invoice.placeOfSupplyStateCode!, stateName: stateName(invoice.placeOfSupplyStateCode) },
      supplyType: c.supplyType!,
      stateTaxLabel: stateTaxLabel(business.stateCode),
      reverseCharge: false,
      lines: c.lines.map((l, i) => ({ position: i + 1, description: l.description, hsnSac: l.hsnSac, unit: l.unit, quantity: l.quantity, unitPrice: l.unitPrice, priceIncludesTax: l.priceIncludesTax, gstRate: l.gstRate, ...l.tax! })),
      totals: c.totals,
      amountInWords: amountInWords(c.totals.grandTotal),
      signatory: { name: business.signatoryName, designation: business.signatoryDesignation },
      issuedAt: issuedAt.toISOString(),
      isDemo: business.isDemo,
    };
    const snapshotJson = JSON.stringify(snapshot);
    const snapshotHash = createHash("sha256").update(snapshotJson).digest("hex");

    // line values first (DB triggers lock lines once the invoice is ISSUED)
    for (const [i, l] of invoice.lineItems.entries()) {
      const t = c.lines[i].tax!;
      await tx.invoiceLineItem.update({ where: { id: l.id }, data: { ...t, hsnSac: c.lines[i].hsnSac, unit: c.lines[i].unit } });
    }
    const updated = await tx.invoice.updateMany({
      where: { id: invoiceId, businessId: ctx.businessId, status: "DRAFT" },
      data: {
        status: "ISSUED", invoiceNumber, financialYear: fy, supplyType: c.supplyType, ...c.totals,
        snapshot: snapshotJson, snapshotHash, idempotencyKey: input.idempotencyKey, issuedAt, issuedByUserId: ctx.userId,
      },
    });
    if (updated.count !== 1) throw new AppError(409, "ALREADY_ISSUED", "Invoice was issued by another request");
    await audit({ businessId: ctx.businessId, userId: ctx.userId, action: "INVOICE_ISSUED", entityType: "Invoice", entityId: invoiceId, metadata: { invoiceNumber, grandTotal: c.totals.grandTotal, snapshotHash } }, tx);
    return tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  });
  return { invoice: result, replayed: false };
}

/** Verifies the stored snapshot against its hash before any document is produced from it. */
export function readVerifiedSnapshot(inv: { snapshot: string | null; snapshotHash: string | null; status: string }): InvoiceSnapshot {
  if (!["ISSUED","CANCELLED"].includes(inv.status) || !inv.snapshot || !inv.snapshotHash) throw new AppError(409, "NOT_ISSUED", "Only issued invoices have a PDF");
  const h = createHash("sha256").update(inv.snapshot).digest("hex");
  if (h !== inv.snapshotHash) throw new AppError(500, "SNAPSHOT_TAMPERED", "Invoice snapshot integrity check failed");
  return JSON.parse(inv.snapshot) as InvoiceSnapshot;
}

// ---------------------------------------------------------------------------
// Ledger queries
// ---------------------------------------------------------------------------
export async function listInvoices(ctx: Ctx, filter: { status?: string; customerId?: string; from?: string; to?: string } = {}) {
  const rows = await prisma.invoice.findMany({
    where: {
      businessId: ctx.businessId,
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.customerId ? { customerId: filter.customerId } : {}),
      ...(filter.from || filter.to ? { invoiceDate: { ...(filter.from ? { gte: dateOnly(filter.from) } : {}), ...(filter.to ? { lt: dateOnly(filter.to) } : {}) } } : {}),
    },
    include: { customer: { select: { name: true } } },
    orderBy: [{ invoiceDate: "desc" }, { createdAt: "desc" }],
    take: 500,
  });
  return rows.map((r) => ({ ...r, invoiceDate: toDateString(r.invoiceDate) }));
}

export async function getInvoiceForDocument(ctx: Ctx, invoiceId: string) {
  const inv = await prisma.invoice.findFirst({ where: { id: invoiceId, businessId: ctx.businessId } });
  if (!inv) throw notFound("Invoice");
  return { invoice: inv, snapshot: readVerifiedSnapshot(inv) };
}
