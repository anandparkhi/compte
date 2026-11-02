import Link from "next/link";
import { Plus } from "lucide-react";
import { requirePageContext } from "@/server/auth/session";
import { listCustomers } from "@/server/services/catalog";
import { Badge, Card, Empty, LinkButton, PageHeader } from "@/components/ui";
import { stateName } from "@/lib/domain/states";

export const dynamic = "force-dynamic";
export default async function CustomersPage() {
  const rows = await listCustomers(await requirePageContext());
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader title="Customers" subtitle="Names and spellings Compte should recognise when you speak." actions={<LinkButton href="/customers/new"><Plus className="size-4" />New customer</LinkButton>} />
      {rows.length === 0 ? <Empty>No customers yet.</Empty> : (
        <Card className="p-0"><ul className="divide-y divide-line">{rows.map((c) => (
          <li key={c.id} className="px-4 py-3 hover:bg-canvas">
            <Link href={`/customers/${c.id}`} className="block">
              <div className="flex items-center justify-between gap-2"><p className="font-semibold">{c.name}</p>{c.gstin ? <span className="font-mono text-xs">{c.gstin}</span> : <Badge tone="warn">Unregistered</Badge>}</div>
              <p className="mt-0.5 text-xs text-muted">{stateName(c.stateCode)}{c.shippingStateCode && c.shippingStateCode !== c.stateCode ? ` · ships to ${stateName(c.shippingStateCode)}` : ""}{c.aliases.length ? ` · also: ${c.aliases.join(", ")}` : ""}</p>
            </Link>
            <Link className="mt-1 inline-block text-xs font-semibold text-brand-700" href={`/invoices?customer=${c.id}`}>Invoice history →</Link>
          </li>
        ))}</ul></Card>
      )}
    </div>
  );
}
