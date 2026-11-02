import { handle } from "@/server/errors";
import { requireApiContext } from "@/server/auth/session";
import { emailInvoice } from "@/server/services/email";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => emailInvoice(await requireApiContext(), (await params).id, await req.json()));
}
