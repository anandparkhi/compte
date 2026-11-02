import "server-only";
import { prisma } from "../db";
import { AppError, notFound } from "../errors";
import { audit } from "../audit";
import { BusinessInput, type BusinessInputT } from "@/lib/schemas";
import { GSTIN_REASON_TEXT, validateGstin } from "@/lib/domain/gstin";
import { isSelectableStateCode } from "@/lib/domain/states";
import { formatInvoiceNumber } from "@/lib/domain/invoice-number";
import { assertCanWrite, type Ctx } from "../auth/ctx";

function validateBusiness(input: BusinessInputT) {
  const g = validateGstin(input.gstin);
  if (!g.valid) throw new AppError(422, "INVALID_GSTIN", GSTIN_REASON_TEXT[g.reason], { field: "gstin" });
  if (!isSelectableStateCode(input.stateCode)) throw new AppError(422, "INVALID_STATE", "Select a valid state", { field: "stateCode" });
  if (g.stateCode !== input.stateCode) throw new AppError(422, "STATE_MISMATCH", `GSTIN state code ${g.stateCode} does not match the selected state ${input.stateCode}`, { field: "stateCode" });
  try {
    formatInvoiceNumber(input.invoicePrefix, input.financialYear, 9999);
  } catch {
    throw new AppError(422, "PREFIX_TOO_LONG", "Invoice prefix makes the invoice number longer than 16 characters", { field: "invoicePrefix" });
  }
  return g.gstin;
}

export async function createBusinessForUser(userId: string, raw: unknown) {
  const input = BusinessInput.parse(raw);
  const gstin = validateBusiness(input);
  const exists = await prisma.business.findUnique({ where: { gstin } });
  if (exists) throw new AppError(409, "GSTIN_EXISTS", "A business with this GSTIN is already set up in Compte. Ask its owner to add you.");
  const business = await prisma.$transaction(async (tx) => {
    const b = await tx.business.create({
      data: {
        ...input,
        gstin,
        tradeName: input.tradeName || null,
        gstinVerificationStatus: "FORMAT_VALID_UNVERIFIED",
        phone: input.phone.replace(/^\+91/, ""),
        phoneDeclarationAt: input.phoneIsGstnRegistered === "UNKNOWN" ? null : new Date(),
      },
    });
    await tx.authorizedBusinessUser.create({ data: { userId, businessId: b.id, role: "OWNER" } });
    await tx.invoiceNumberSequence.create({ data: { businessId: b.id, financialYear: input.financialYear, prefix: input.invoicePrefix, nextNumber: 1 } });
    return b;
  });
  await audit({ businessId: business.id, userId, action: "BUSINESS_ONBOARDED", entityType: "Business", entityId: business.id, metadata: { gstinStatus: "FORMAT_VALID_UNVERIFIED" } });
  return business;
}

export async function getBusiness(ctx: Ctx) {
  const b = await prisma.business.findUnique({ where: { id: ctx.businessId } });
  if (!b) throw notFound("Business");
  return b;
}

export async function updateBusiness(ctx: Ctx, raw: unknown) {
  assertCanWrite(ctx);
  const input = BusinessInput.parse(raw);
  const current = await getBusiness(ctx);
  const gstin = validateBusiness(input);
  if (gstin !== current.gstin) {
    const issued = await prisma.invoice.count({ where: { businessId: ctx.businessId, status: "ISSUED" } });
    if (issued) throw new AppError(409, "GSTIN_LOCKED", "GSTIN cannot be changed after invoices have been issued");
  }
  const updated = await prisma.business.update({
    where: { id: ctx.businessId },
    data: {
      ...input,
      gstin,
      tradeName: input.tradeName || null,
      phone: input.phone.replace(/^\+91/, ""),
      phoneDeclarationAt: input.phoneIsGstnRegistered !== current.phoneIsGstnRegistered ? new Date() : current.phoneDeclarationAt,
    },
  });
  await audit({ businessId: ctx.businessId, userId: ctx.userId, action: "BUSINESS_UPDATED", entityType: "Business", entityId: ctx.businessId });
  return updated;
}

export async function setPreferredLanguage(ctx: Ctx, lang: "en" | "hi" | "mr") {
  await prisma.business.update({ where: { id: ctx.businessId }, data: { preferredLanguage: lang } });
}
