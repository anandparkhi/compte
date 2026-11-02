import { handle } from "@/server/errors";
import { requireApiContext } from "@/server/auth/session";
import { archiveCustomer, getCustomer, updateCustomer } from "@/server/services/catalog";

type P = { params: Promise<{ id: string }> };
export async function GET(_: Request, { params }: P) {
  return handle(async () => getCustomer(await requireApiContext(), (await params).id));
}
export async function PUT(req: Request, { params }: P) {
  return handle(async () => updateCustomer(await requireApiContext(), (await params).id, await req.json()));
}
export async function DELETE(_: Request, { params }: P) {
  return handle(async () => { await archiveCustomer(await requireApiContext(), (await params).id); return { ok: true }; });
}
