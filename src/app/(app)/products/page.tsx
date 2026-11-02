import Link from "next/link";
import { ArrowRight, FileInput, Plus } from "lucide-react";
import { requirePageContext } from "@/server/auth/session";
import { listProducts } from "@/server/services/catalog";
import { Badge, Card, Empty, LinkButton, PageHeader } from "@/components/ui";
import { formatINR } from "@/lib/domain/money";

export const dynamic = "force-dynamic";

export default async function ProductsPage(){
 const rows=await listProducts(await requirePageContext());
 const review=rows.filter(p=>p.taxSource==="HISTORICAL_IMPORT_UNVERIFIED");
 const ready=rows.filter(p=>p.taxSource!=="HISTORICAL_IMPORT_UNVERIFIED");
 const productList=(items:typeof rows)=><ul className="divide-y divide-line">{items.map(p=><li key={p.id}>
  <Link href={`/products/${p.id}`} className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-canvas">
   <div className="min-w-0 space-y-1"><p className="truncate font-semibold">{p.name}</p><p className="text-xs text-muted">{p.kind==="GOODS"?"HSN":"SAC"} {p.hsnSac} · {p.unit}</p>{p.taxSource==="HISTORICAL_IMPORT_UNVERIFIED"&&<Badge tone="warn">Review before invoicing</Badge>}</div>
   <div className="shrink-0 text-right"><p className="font-semibold">{p.taxSource==="HISTORICAL_IMPORT_UNVERIFIED"?"Set price":formatINR(p.defaultPrice)}</p><p className="text-xs text-muted">{p.taxSource==="HISTORICAL_IMPORT_UNVERIFIED"?"Historical rate: ":"GST "}{p.gstRate}%</p></div>
   <ArrowRight className="size-4 shrink-0 text-brand-700"/>
  </Link>
 </li>)}</ul>;
 return <div className="mx-auto max-w-4xl space-y-5">
  <PageHeader title="Products & services" subtitle="Your catalogue for new invoices" actions={<LinkButton href="/products/new"><Plus className="size-4"/>Add product</LinkButton>}/>
  {review.length>0&&<Card className="overflow-hidden p-0"><div className="bg-warn-50 p-4"><h2 className="font-semibold">Needs your review · {review.length}</h2><p className="mt-1 text-sm text-muted">These product suggestions came from old GST returns. Confirm the product type, HSN/SAC, current GST rate and selling price before invoicing.</p></div>{productList(review)}</Card>}
  <Card className="overflow-hidden p-0"><h2 className="border-b border-line px-4 py-3 font-semibold">Ready for invoicing · {ready.length}</h2>{ready.length?productList(ready):<div className="space-y-2 p-4"><Empty>No confirmed products yet.</Empty><Link href="/gst-import" className="inline-flex items-center gap-2 text-sm font-semibold text-brand-700"><FileInput className="size-4"/>Import HSN product suggestions</Link></div>}</Card>
 </div>;
}
