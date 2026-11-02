import { notFound } from "next/navigation";
import { requirePageContext } from "@/server/auth/session";
import { getProduct } from "@/server/services/catalog";
import { Alert, PageHeader } from "@/components/ui";
import { ProductForm } from "@/components/forms/product-form";

export const dynamic = "force-dynamic";
export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePageContext();
  const p = await getProduct(ctx, (await params).id).catch(() => null);
  if (!p) notFound();
  return (
    <div className="mx-auto max-w-3xl space-y-4"><PageHeader title={p.name} />
      {p.taxSource === "DEMO_SEED" && <Alert tone="demo">Demo configuration for a fictional business. Verify the HSN/SAC and rate against current CBIC notifications before using real data.</Alert>}
      <ProductForm id={p.id} initial={{ name: p.name, aliases: p.aliases, description: p.description ?? "", kind: p.kind as "GOODS", hsnSac: p.hsnSac, unit: p.unit, defaultPrice: p.defaultPrice, gstRate: p.gstRate, priceIncludesTax: p.priceIncludesTax, taxEffectiveFrom: p.taxEffectiveFrom?.toISOString().slice(0, 10) ?? "" }} />
    </div>
  );
}
