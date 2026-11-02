import Link from "next/link";
import { FileInput, Plus } from "lucide-react";
import { requirePageContext } from "@/server/auth/session";
import { listCustomers } from "@/server/services/catalog";
import { Badge, Card, Empty, LinkButton, PageHeader } from "@/components/ui";
import { stateName } from "@/lib/domain/states";

export const dynamic = "force-dynamic";
export default async function CustomersPage() {
  const rows = await listCustomers(await requirePageContext());
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader title="Customers" subtitle="People and businesses you invoice, including customers found in GST history." actions={<LinkButton href="/customers/new"><Plus className="size-4" />New customer</LinkButton>} />
      {rows.some(c=>c.name.startsWith("Imported GSTIN "))&&<Card className="space-y-1 bg-brand-50"><p className="font-semibold">Some customer details need review</p><p className="text-sm text-muted">GST return files often contain only a GSTIN. Open an imported customer to add their real name, address and contact details before invoicing.</p></Card>}
      {rows.length === 0 ? <Card className="space-y-3"><Empty>No customers saved yet. You can add customers manually or extract their GSTINs from a GST return.</Empty><Link className="inline-flex items-center gap-2 text-sm font-semibold text-brand-700" href="/gst-import"><FileInput className="size-4"/>Import GST customers →</Link></Card> : (
        <Card className="p-0"><ul className="divide-y divide-line">{rows.map((c) => (
          <li key={c.id} className="px-4 py-3 hover:bg-canvas">
            <Link href={`/customers/${c.id}`} className="block">
              <div className="flex items-center justify-between gap-2"><p className="font-semibold">{c.name.startsWith("Imported GSTIN ") ? "Customer details needed" : c.name}</p>{c.gstin ? <span className="font-mono text-xs">{c.gstin}</span> : <Badge tone="warn">Unregistered</Badge>}</div>
              {c.name.startsWith("Imported GSTIN ") && <Badge tone="warn">Imported · update details</Badge>}
              <p className="mt-0.5 text-xs text-muted">{stateName(c.stateCode)}{c.shippingStateCode && c.shippingStateCode !== c.stateCode ? ` · ships to ${stateName(c.shippingStateCode)}` : ""}{c.aliases.length ? ` · also: ${c.aliases.join(", ")}` : ""}</p>
            </Link>
            <Link className="mt-1 inline-block text-xs font-semibold text-brand-700" href={`/invoices?customer=${c.id}`}>Invoice history →</Link>
          </li>
        ))}</ul></Card>
      )}
    </div>
  );
}
