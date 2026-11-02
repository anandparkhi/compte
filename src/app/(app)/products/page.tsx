import Link from "next/link";
import { Plus } from "lucide-react";
import { requirePageContext } from "@/server/auth/session";
import { listProducts } from "@/server/services/catalog";
import { Badge, Card, Empty, LinkButton, PageHeader } from "@/components/ui";
import { formatINR } from "@/lib/domain/money";

export const dynamic = "force-dynamic";
export default async function ProductsPage() {
  const rows = await listProducts(await requirePageContext());
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader title="Products & services" subtitle="HSN/SAC and GST rates come only from here — Compte never invents them." actions={<LinkButton href="/products/new"><Plus className="size-4" />New product</LinkButton>} />
      <p className="text-xs text-muted">Products created from historical HSN summaries are provisional. Review their type, GST rate, unit and selling price before issuing an invoice.</p>
      {rows.length === 0 ? <Empty>No products yet.</Empty> : (
        <Card className="p-0"><ul className="divide-y divide-line">{rows.map((p) => (
          <li key={p.id}><Link href={`/products/${p.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-canvas">
            <div className="min-w-0">
              <p className="truncate font-semibold">{p.name}</p>
              <p className="text-xs text-muted"><span className="font-mono">{p.kind === "GOODS" ? "HSN" : "SAC"} {p.hsnSac}</span> · {p.unit}{p.aliases.length ? ` · ${p.aliases.join(", ")}` : ""}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="tabular font-semibold">{formatINR(p.defaultPrice)}</p>
              <span className="inline-flex gap-1"><Badge tone="brand">GST {p.gstRate}%</Badge>{p.taxSource === "HISTORICAL_IMPORT_UNVERIFIED" && <Badge tone="warn">Imported · verify</Badge>}{p.taxSource === "DEMO_SEED" && <Badge tone="demo">demo config</Badge>}</span>
            </div>
          </Link></li>
        ))}</ul></Card>
      )}
    </div>
  );
}
