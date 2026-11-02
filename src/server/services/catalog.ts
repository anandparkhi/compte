import "server-only";
import { prisma } from "../db";
import { AppError, notFound } from "../errors";
import { audit } from "../audit";
import { CustomerInput, ProductInput } from "@/lib/schemas";
import { GSTIN_REASON_TEXT, validateGstin } from "@/lib/domain/gstin";
import { validateHsnSac } from "@/lib/domain/gst";
import { dateOnly } from "@/lib/domain/periods";
import { assertCanWrite, type Ctx } from "../auth/ctx";
import type { Catalog } from "@/lib/nlp/types";

const parseAliases = (s: string): string[] => {
  try { const a = JSON.parse(s); return Array.isArray(a) ? a.filter((x) => typeof x === "string") : []; } catch { return []; }
};

// ---------- Customers ----------
export async function listCustomers(ctx: Ctx) {
  const rows = await prisma.customer.findMany({ where: { businessId: ctx.businessId, archivedAt: null }, orderBy: { name: "asc" } });
  return rows.map((c) => ({ ...c, aliases: parseAliases(c.aliases) }));
}

export async function getCustomer(ctx: Ctx, id: string) {
  const c = await prisma.customer.findFirst({ where: { id, businessId: ctx.businessId } });
  if (!c) throw notFound("Customer");
  return { ...c, aliases: parseAliases(c.aliases) };
}

function validateCustomer(raw: unknown) {
  const input = CustomerInput.parse(raw);
  let gstin: string | null = null;
  if (input.registrationStatus === "REGISTERED") {
    const g = validateGstin(input.gstin ?? "");
    if (!g.valid) throw new AppError(422, "INVALID_GSTIN", `Customer GSTIN: ${GSTIN_REASON_TEXT[g.reason]}`, { field: "gstin" });
    if (g.stateCode !== input.stateCode) throw new AppError(422, "STATE_MISMATCH", `Customer GSTIN state ${g.stateCode} does not match selected state ${input.stateCode}`, { field: "stateCode" });
    gstin = g.gstin;
  }
  return {
    name: input.name,
    aliases: JSON.stringify(input.aliases),
    registrationStatus: input.registrationStatus,
    gstin,
    stateCode: input.stateCode,
    billingAddress: input.billingAddress,
    shippingAddress: input.shippingAddress || null,
    shippingStateCode: input.shippingAddress ? input.shippingStateCode || input.stateCode : null,
    phone: input.phone || null,
    email: input.email || null,
  };
}

export async function createCustomer(ctx: Ctx, raw: unknown) {
  assertCanWrite(ctx);
  const data = validateCustomer(raw);
  if (data.gstin && (await prisma.customer.findFirst({ where: { businessId: ctx.businessId, gstin: data.gstin } }))) {
    throw new AppError(409, "DUPLICATE_CUSTOMER", "A customer with this GSTIN already exists");
  }
  const c = await prisma.customer.create({ data: { ...data, businessId: ctx.businessId } });
  await audit({ businessId: ctx.businessId, userId: ctx.userId, action: "CUSTOMER_CREATED", entityType: "Customer", entityId: c.id });
  return c;
}

export async function updateCustomer(ctx: Ctx, id: string, raw: unknown) {
  assertCanWrite(ctx);
  await getCustomer(ctx, id);
  const data = validateCustomer(raw);
  const c = await prisma.customer.update({ where: { id }, data });
  await audit({ businessId: ctx.businessId, userId: ctx.userId, action: "CUSTOMER_UPDATED", entityType: "Customer", entityId: id });
  return c;
}

export async function archiveCustomer(ctx: Ctx, id: string) {
  assertCanWrite(ctx);
  await getCustomer(ctx, id);
  await prisma.customer.update({ where: { id }, data: { archivedAt: new Date() } });
  await audit({ businessId: ctx.businessId, userId: ctx.userId, action: "CUSTOMER_ARCHIVED", entityType: "Customer", entityId: id });
}

// ---------- Products ----------
export async function listProducts(ctx: Ctx) {
  const rows = await prisma.product.findMany({ where: { businessId: ctx.businessId, archivedAt: null }, orderBy: { name: "asc" } });
  return rows.map((p) => ({ ...p, aliases: parseAliases(p.aliases) }));
}

export async function getProduct(ctx: Ctx, id: string) {
  const p = await prisma.product.findFirst({ where: { id, businessId: ctx.businessId } });
  if (!p) throw notFound("Product");
  return { ...p, aliases: parseAliases(p.aliases) };
}

function validateProduct(raw: unknown) {
  const input = ProductInput.parse(raw);
  const hsnErr = validateHsnSac(input.hsnSac, input.kind);
  if (hsnErr) throw new AppError(422, "INVALID_HSN", hsnErr, { field: "hsnSac" });
  return {
    name: input.name,
    aliases: JSON.stringify(input.aliases),
    description: input.description || null,
    kind: input.kind,
    hsnSac: input.hsnSac,
    unit: input.unit,
    defaultPrice: input.defaultPrice,
    gstRate: input.gstRate,
    priceIncludesTax: input.priceIncludesTax,
    taxEffectiveFrom: input.taxEffectiveFrom ? dateOnly(input.taxEffectiveFrom) : null,
    taxSource: "USER_ENTERED",
    taxConfirmedAt: new Date(),
  };
}

export async function createProduct(ctx: Ctx, raw: unknown) {
  assertCanWrite(ctx);
  const p = await prisma.product.create({ data: { ...validateProduct(raw), businessId: ctx.businessId } });
  await audit({ businessId: ctx.businessId, userId: ctx.userId, action: "PRODUCT_CREATED", entityType: "Product", entityId: p.id, metadata: { hsnSac: p.hsnSac, gstRate: p.gstRate } });
  return p;
}

export async function updateProduct(ctx: Ctx, id: string, raw: unknown) {
  assertCanWrite(ctx);
  const before = await getProduct(ctx, id);
  const data = validateProduct(raw);
  const p = await prisma.product.update({ where: { id }, data });
  await audit({ businessId: ctx.businessId, userId: ctx.userId, action: "PRODUCT_UPDATED", entityType: "Product", entityId: id, metadata: { from: { hsnSac: before.hsnSac, gstRate: before.gstRate }, to: { hsnSac: p.hsnSac, gstRate: p.gstRate } } });
  return p;
}

export async function archiveProduct(ctx: Ctx, id: string) {
  assertCanWrite(ctx);
  await getProduct(ctx, id);
  await prisma.product.update({ where: { id }, data: { archivedAt: new Date() } });
  await audit({ businessId: ctx.businessId, userId: ctx.userId, action: "PRODUCT_ARCHIVED", entityType: "Product", entityId: id });
}

export async function loadCatalog(businessId: string): Promise<Catalog> {
  const [customers, products] = await Promise.all([
    prisma.customer.findMany({ where: { businessId, archivedAt: null }, select: { id: true, name: true, aliases: true } }),
    prisma.product.findMany({ where: { businessId, archivedAt: null }, select: { id: true, name: true, aliases: true, unit: true } }),
  ]);
  return {
    customers: customers.map((c) => ({ ...c, aliases: parseAliases(c.aliases) })),
    products: products.map((p) => ({ ...p, aliases: parseAliases(p.aliases) })),
  };
}
