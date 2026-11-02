import { requirePageContext } from "@/server/auth/session";
import { GstImportForm } from "@/components/forms/gst-import-form";
export const dynamic = "force-dynamic";
export default async function ImportPage() {
  await requirePageContext();
  return <div className="mx-auto max-w-3xl space-y-4"><h1 className="text-2xl font-bold">Import GST returns</h1><p className="text-sm text-muted">Upload a GSTR-1 JSON export or supported Excel template. Review before saving. Historical records are not newly issued invoices or filed returns.</p><GstImportForm /></div>;
}
