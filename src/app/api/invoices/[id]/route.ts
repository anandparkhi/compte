import { handle } from "@/server/errors";
import { requireApiContext } from "@/server/auth/session";
import { discardDraft, getInvoiceView, updateDraft } from "@/server/services/invoices";

type P = { params: Promise<{ id: string }> };
export async function GET(_: Request, { params }: P) {
  return handle(async () => getInvoiceView(await requireApiContext(), (await params).id));
}
export async function PUT(req: Request, { params }: P) {
  return handle(async () => updateDraft(await requireApiContext(), (await params).id, await req.json()));
}
export async function DELETE(_: Request, { params }: P) {
  return handle(async () => { await discardDraft(await requireApiContext(), (await params).id); return { ok: true }; });
}
